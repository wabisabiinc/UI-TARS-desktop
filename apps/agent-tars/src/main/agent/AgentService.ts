import { BrowserWindow, ipcMain } from 'electron';
import { v4 as uuid } from 'uuid';
import { MCPToolResult } from '@main/type';
import { Message, ToolCall } from '@agent-infra/shared';
// import { createLLM } from '@main/llmProvider';
import { executeCustomTool, listCustomTools } from '@main/customTools';
import { createMcpClient } from '@main/mcp/client';
import { mcpToolsToAzureTools } from '@main/mcp/tools';
import { AgentContext } from './types';
import { EventManager } from './EventManager';
import { currentLLMConfigRef } from '../ipcRoutes/llm';
import { server as ipcServer } from '../ipcRoutes';
import { logger } from '../utils/logger';
import { extractToolNames } from '../utils/extractToolNames';
import { ChatCompletionTool } from 'openai/resources';

export class AgentService {
  private static instance: AgentService;
  private activeAgents: Map<
    string,
    {
      context: AgentContext;
      eventManager: EventManager;
      abortController: AbortController;
    }
  > = new Map();

  private constructor() {}

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  // Initialize the Agent service
  public init() {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    // Handle starting a new agent session
    ipcMain.handle('agent:start', async (_, payload: { inputText: string }) => {
      try {
        const agentId = uuid();
        const context = this.createAgentContext(agentId);
        const eventManager = new EventManager(agentId);
        const abortController = new AbortController();

        this.activeAgents.set(agentId, {
          context,
          eventManager,
          abortController,
        });

        // Start agent processing in the background
        this.runAgent(agentId, payload.inputText).catch((err) => {
          logger.error(`Error running agent ${agentId}: ${err}`);
          this.sendAgentEvent(agentId, 'error', {
            message: `Error: ${err.message}`,
          });
        });

        return { agentId };
      } catch (error) {
        logger.error('Failed to start agent:', error);
        throw error;
      }
    });

    // Handle stopping an agent
    ipcMain.handle('agent:stop', (_, { agentId }: { agentId: string }) => {
      return this.stopAgent(agentId);
    });

    // Handle user interruption
    ipcMain.handle(
      'agent:interrupt',
      (_, { agentId, text }: { agentId: string; text: string }) => {
        return this.interruptAgent(agentId, text);
      },
    );

    // Handle getting all events for an agent
    ipcMain.handle('agent:getEvents', (_, { agentId }: { agentId: string }) => {
      const agent = this.activeAgents.get(agentId);
      if (!agent) {
        return { events: [] };
      }
      return { events: agent.eventManager.getAllEvents() };
    });

    // Cleanup when application is about to quit
    ipcMain.handle('agent:cleanup', async () => {
      // Stop all active agents
      for (const agentId of this.activeAgents.keys()) {
        await this.stopAgent(agentId);
      }
      return true;
    });
  }

  private createAgentContext(agentId: string): AgentContext {
    return {
      plan: [],
      currentStep: 0,
      memory: new Map(),
      agentId,
      requestId: uuid(),
    };
  }

  private async runAgent(agentId: string, inputText: string) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const { context, eventManager, abortController } = agent;

    try {
      // Start with greeting
      await this.generateGreeting(agentId, inputText);

      // Initial thinking state
      eventManager.addLoadingStatus('Thinking');
      this.sendAgentEvent(agentId, 'status', { status: 'Thinking' });

      // Start the planning phase
      await this.planningPhase(agentId, inputText);

      // Execute the agent loop until completion or abort
      await this.agentLoop(agentId);

      // Add completion event if not aborted
      if (!abortController.signal.aborted) {
        eventManager.addEndEvent('> Agent TARS has finished.');
        this.sendAgentEvent(agentId, 'complete', {});
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.info(`Agent ${agentId} aborted`);
      } else {
        logger.error(`Error in agent ${agentId}: ${error}`);
        eventManager.addEndEvent(`> Error: ${error.message}`);
        this.sendAgentEvent(agentId, 'error', { message: error.message });
      }
    } finally {
      // Clean up references even if there was an error
      // Keep the agent record for event history access
      // this.activeAgents.delete(agentId);
    }
  }

  private async generateGreeting(agentId: string, inputText: string) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    // const llm = createLLM(currentLLMConfigRef.current);

    let greetingMessage = '';
    try {
      const streamId = uuid();

      const messagePromise = server.askLLMText({
        messages: [
          Message.systemMessage(`
            You are a friendly greeter. Your role is to:
            - Understand and empathize with users first
            - Provide a warm, professional response
            - Add a small amount of emoji to enhance the atmosphere
            - Express understanding before offering solutions
            - Keep your greeting brief and encouraging
            - Be enthusiastic and positive
            - Let the user know you're ready to help them
            
            Don't ask the user any questions, just greet them warmly.
          `),
          Message.userMessage(inputText),
        ],
        requestId: streamId,
      });

      // Wait a short time to get a partial response
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve("I'm analyzing your request..."), 2000);
      });

      greetingMessage = await Promise.race([messagePromise, timeoutPromise]);

      // Add greeting event
      agent.eventManager.addChatText(greetingMessage, []);
      this.sendAgentEvent(agentId, 'update', {
        events: agent.eventManager.getAllEvents(),
      });
    } catch (error) {
      logger.error('Failed to generate greeting:', error);
    }
  }

  private async planningPhase(agentId: string, inputText: string) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    const { context, eventManager, abortController } = agent;

    // Create LLM instance
    // const llm = createLLM(currentLLMConfigRef.current);

    const systemPrompt = `You are an AI agent with the ability to analyze the current environment, decide the next task status, tell user the next specific action.

<task_description>
You must call the aware_analysis tool.

You should give the insights of current environment according to the various context information, and then decide the next task status.

If the task is none or current step is done, you should increment the step number and update system status. Please return the json output in the tool call part:

\`\`\`json
{
  "reflection": "[your reflection about current environment]",
  "step": "[next step number]",
  "plan": "[steps array with id and title fields]",
  "status": "[next task description, a complete sentence tell user what to do next]",
}
\`\`\`

You should output the reflection first.

You should not output any response text and only return the tool call.

Only when there is no existing plan in the current environment, you should return plan field with the following format:
- id: string (format: "step_XXX" where XXX is a sequential number starting from 001)
- title: string (clear, concise description of the step)

</task_description>`;

    const awareSchema = {
      type: 'object',
      properties: {
        step: {
          type: 'number',
          description: 'Next step number',
        },
        status: {
          type: 'string',
          description:
            'Next task description, a complete sentence tell user what to do next',
        },
        reflection: {
          type: 'string',
          description: 'Your reflection about current environment',
        },
        plan: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title'],
            properties: {
              id: {
                type: 'string',
                description: 'Step ID is a sequential number',
              },
              title: {
                type: 'string',
                minLength: 1,
                description: 'Clear and concise description of the step',
              },
            },
          },
        },
      },
      required: ['step', 'status', 'reflection'],
    } as const;

    try {
      const result = await ipcServer.askLLMTool({
        messages: [
          Message.systemMessage(systemPrompt),
          Message.userMessage(inputText),
          Message.userMessage(
            `Please call aware_analysis tool to give me next decision.`,
          ),
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'aware_analysis',
              description:
                'Analyze the current environment with user input, and decide the next task status',
              parameters: awareSchema,
            },
          },
        ],
        requestId: context.requestId,
      });

      if (!result.tool_calls?.length) {
        throw new Error('No planning result returned');
      }

      const planResult = JSON.parse(result.tool_calls[0].function.arguments);

      // Update context
      context.plan = planResult.plan || [];
      context.currentStep = planResult.step || 1;

      // Add events
      eventManager.addPlanUpdate(context.currentStep, context.plan);
      eventManager.addAgentStatus(planResult.status);

      // Notify renderer
      this.sendAgentEvent(agentId, 'update', {
        events: eventManager.getAllEvents(),
        plan: context.plan,
        currentStep: context.currentStep,
      });
    } catch (error) {
      logger.error('Planning phase error:', error);
      throw new Error(`Planning failed: ${error.message}`);
    }
  }

  private async agentLoop(agentId: string) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    const { context, eventManager, abortController } = agent;

    // Running flag to control loop execution
    let hasFinished = false;

    // Start main agent loop
    while (!abortController.signal.aborted && !hasFinished) {
      try {
        // Add loading status at the beginning of each iteration
        eventManager.addLoadingStatus('Thinking');
        this.sendAgentEvent(agentId, 'status', { status: 'Thinking' });

        // Execute the action phase
        const toolCalls = await this.actionPhase(agentId);

        // Process tool calls and execute tools
        for (const toolCall of toolCalls) {
          if (abortController.signal.aborted) {
            break;
          }

          const toolName = toolCall.function.name;

          // Notify about tool execution
          eventManager.addToolCallStart(toolName, toolCall.function.arguments);

          // Show loading status for tool
          eventManager.addToolExecutionLoading(toolCall);
          this.sendAgentEvent(agentId, 'update', {
            events: eventManager.getAllEvents(),
          });

          // Execute the tool
          const toolResult = await this.executeTool(agentId, toolCall);

          // Handle the tool result
          await this.handleToolExecution({
            agentId,
            toolName,
            toolCallId: toolCall.id,
            params: toolCall.function.arguments,
            result: toolResult?.[0]?.content,
            isError: toolResult?.[0]?.isError || false,
          });

          // Check for idle tool call which signals completion
          if (toolName === 'idle') {
            hasFinished = true;
            break;
          }
        }

        // Run awareness to update plan
        const updatedPlan = await this.awarenessPhase(agentId);
        if (updatedPlan?.plan?.length > 0) {
          context.plan = updatedPlan.plan;
        }

        // Update step progress
        if (updatedPlan?.step) {
          const newStep = updatedPlan.step;
          if (newStep > context.currentStep) {
            context.currentStep = newStep;
            eventManager.addNewPlanStep(context.currentStep);

            // All steps completed
            if (newStep > context.plan.length) {
              hasFinished = true;
            }
          }
        }

        // Update status
        if (updatedPlan?.status) {
          eventManager.addAgentStatus(updatedPlan.status);
        }

        // Update renderer with latest events
        this.sendAgentEvent(agentId, 'update', {
          events: eventManager.getAllEvents(),
          plan: context.plan,
          currentStep: context.currentStep,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          logger.info(`Agent loop aborted for agent ${agentId}`);
          break;
        }
        logger.error(`Error in agent loop for ${agentId}:`, error);
        eventManager.addEndEvent(`Error: ${error.message}`);
        this.sendAgentEvent(agentId, 'error', {
          message: error.message,
          events: eventManager.getAllEvents(),
        });
        throw error;
      }
    }
  }

  private async actionPhase(agentId: string): Promise<ToolCall[]> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return [];

    const { context, eventManager, abortController } = agent;

    const systemPrompt = `You are a tool use expert. You should call the appropriate tools according to the aware status and environment information.You should not output any response text and only return the JSON.

<overall_principal>
- Must respond with a tool use (function calling); plain text responses are forbidden
- Do not mention any specific tool names to users in messages
- Carefully verify available tools; do not fabricate non-existent tools
- Follow the instructions carefully in the aware status.
- Don't repeat the same mean with aware status, you should select the appropriate tool.
- Don't ask user anything, just tell user what you will do next.If some points is not very clear, you should tell user your solution.Don't ask user anything, remember, you are a agent for user.
- You should only respond chat message after you have finished some tools and return the summary in chat message.
- You should not output any response text and only return the tool call.
- Don't output any file path in current machine and ensure the security in your message. Don't output any absolute path in your message.
</overall_principal>`;

    try {
      // Fetch all available tools
      const mcpClient = await createMcpClient();
      const mcpTools = await mcpClient.listTools();
      const customTools = listCustomTools();
      const executorTools = [
        {
          type: 'function',
          function: {
            name: 'idle',
            description:
              'If you find the current task is done, and current task is the last task, then you should call this tool to indicate that you are done.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'chat-message',
            description:
              'You can communicate with user by this tool. You should call this tool to output the response text to user.',
            parameters: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description:
                    'The response text to user, should be a summary of the current step, and should not be more than 150 words.',
                },
                attachments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      path: {
                        type: 'string',
                        description:
                          'The file path of the attachment that has been created in the past steps',
                      },
                    },
                  },
                },
              },
              required: ['text'],
            },
          },
        },
      ] as ChatCompletionTool[];

      // Current environment info
      const environmentInfo = `
Plan: ${context.plan.map((item) => `  - [${item.id}] ${item.title}`).join('\n')}

Current step: ${context.currentStep}

Current task: ${context.plan[context.currentStep - 1]?.title || 'None'} 
      `;

      // Get latest agent status
      const lastAgentStatus =
        [...eventManager.getAllEvents()]
          .reverse()
          .find((event) => event.type === 'agent-status')?.content ||
        'Awaiting instructions';

      // Create LLM instance
      // const llm = createLLM(currentLLMConfigRef.current);

      // Available tools for the LLM
      const availableTools = [
        ...executorTools,
        ...mcpToolsToAzureTools(mcpTools),
        ...customTools,
      ];

      logger.info('[action phase] tools', extractToolNames(availableTools));

      // Get LLM to decide on actions
      const result = await ipcServer.askLLMTool({
        messages: [
          Message.systemMessage(systemPrompt),
          Message.userMessage(environmentInfo),
          Message.userMessage(`Aware status: ${lastAgentStatus}`),
        ],
        tools: availableTools,
        requestId: context.requestId,
      });

      if (!result.tool_calls?.length) {
        throw new Error('No action tool calls returned');
      }

      return result.tool_calls.filter(Boolean);
    } catch (error) {
      logger.error('Action phase error:', error);
      throw new Error(`Action phase failed: ${error.message}`);
    }
  }

  private async awarenessPhase(agentId: string) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return null;

    const { context, eventManager, abortController } = agent;

    // Similar to planningPhase but focused on updating status
    const systemPrompt = `You are an AI agent with the ability to analyze the current environment, decide the next task status, tell user the next specific action.

<task_description>
You must call the aware_analysis tool.

You should give the insights of current environment according to the various context information, and then decide the next task status.

If the task is none or current step is done, you should increment the step number and update system status. Please return the json output in the tool call part:

\`\`\`json
{
  "reflection": "[your reflection about current environment]",
  "step": "[next step number]",
  "status": "[next task description, a complete sentence tell user what to do next]",
}
\`\`\`
</task_description>`;

    const awareSchema = {
      type: 'object',
      properties: {
        step: {
          type: 'number',
          description: 'Next step number',
        },
        status: {
          type: 'string',
          description:
            'Next task description, a complete sentence tell user what to do next',
        },
        reflection: {
          type: 'string',
          description: 'Your reflection about current environment',
        },
      },
      required: ['step', 'status', 'reflection'],
    } as const;

    // Collect environment information
    const events = eventManager.normalizeEventsForPrompt();
    const environmentInfo = `
Event stream result history: ${events}

The plan:
${context.plan.map((item) => `  - [${item.id}] ${item.title}`).join('\n')}

Current step: ${context.currentStep}

Current task: ${context.plan[context.currentStep - 1]?.title || 'None'}
    `;

    try {
      // const llm = createLLM(currentLLMConfigRef.current);

      const result = await ipcServer.askLLMTool({
        messages: [
          Message.systemMessage(systemPrompt),
          Message.userMessage(environmentInfo),
          Message.userMessage(
            `Please call aware_analysis tool to give me next decision.`,
          ),
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'aware_analysis',
              description:
                'Analyze the current environment with user input, and decide the next task status',
              parameters: awareSchema,
            },
          },
        ],
        requestId: context.requestId,
      });

      if (!result.tool_calls?.length) {
        return null;
      }

      return JSON.parse(result.tool_calls[0].function.arguments);
    } catch (error) {
      logger.error('Awareness phase error:', error);
      return null;
    }
  }

  private async executeTool(
    agentId: string,
    toolCall: ToolCall,
  ): Promise<MCPToolResult | null> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return null;

    try {
      const { context } = agent;

      // First try custom tools
      const customResult = await executeCustomTool(toolCall);
      if (customResult) {
        return customResult;
      }

      // Otherwise use MCP tools
      const mcpClient = await createMcpClient();
      const mcpTools = await mcpClient.listTools();

      // Find matching MCP tool
      const matchingTool = mcpTools.find(
        (tool) => tool.name === toolCall.function.name,
      );
      if (!matchingTool) {
        return [
          {
            isError: true,
            content: [`Tool not found: ${toolCall.function.name}`],
          },
        ];
      }

      // Execute the MCP tool
      return [
        await mcpClient.callTool({
          client: matchingTool.serverName,
          name: matchingTool.name,
          args: JSON.parse(toolCall.function.arguments || '{}'),
        }),
      ];
    } catch (error) {
      logger.error(`Error executing tool ${toolCall.function.name}:`, error);
      return [
        {
          isError: true,
          content: [`Error executing tool: ${error.message}`],
        },
      ];
    }
  }

  private async handleToolExecution({
    agentId,
    toolName,
    toolCallId,
    params,
    result,
    isError,
  }: {
    agentId: string;
    toolName: string;
    toolCallId: string;
    params: string;
    result: any;
    isError: boolean;
  }) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    const { eventManager } = agent;

    // For chat message tool
    if (toolName === 'chat-message') {
      const parsedParams = JSON.parse(params);
      await eventManager.addChatText(
        parsedParams.text,
        parsedParams.attachments || [],
      );
      this.sendAgentEvent(agentId, 'update', {
        events: eventManager.getAllEvents(),
      });
      return;
    }

    // For other tools
    await eventManager.handleToolExecution({
      toolName,
      toolCallId,
      params,
      result,
      isError,
    });

    await eventManager.addObservation(JSON.stringify(result));

    this.sendAgentEvent(agentId, 'update', {
      events: eventManager.getAllEvents(),
    });
  }

  private sendAgentEvent(agentId: string, eventType: string, data: any) {
    try {
      // Send to all browser windows
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(`agent:${eventType}`, {
            agentId,
            timestamp: Date.now(),
            ...data,
          });
        }
      });
    } catch (error) {
      logger.error(`Failed to send agent event ${eventType}:`, error);
    }
  }

  private async stopAgent(agentId: string): Promise<boolean> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return false;
    }

    try {
      // Abort the agent execution
      agent.abortController.abort();

      // Add termination message
      agent.eventManager.addEndEvent('> Agent TARS has been terminated.');

      // Notify renderer
      this.sendAgentEvent(agentId, 'terminate', {
        events: agent.eventManager.getAllEvents(),
      });

      // Keep the agent in the map for event history
      // Only clean up the abort controller to avoid memory leaks
      this.activeAgents.set(agentId, {
        ...agent,
        abortController: new AbortController(),
      });

      return true;
    } catch (error) {
      logger.error(`Failed to stop agent ${agentId}:`, error);
      return false;
    }
  }

  private async interruptAgent(
    agentId: string,
    text: string,
  ): Promise<boolean> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return false;
    }

    try {
      // Add user interruption event
      await agent.eventManager.addUserInterruptionInput(text);

      // Notify renderer
      this.sendAgentEvent(agentId, 'update', {
        events: agent.eventManager.getAllEvents(),
      });

      // Create new abort controller for current execution cycle
      agent.abortController.abort();
      const newAbortController = new AbortController();

      // Update the agent with new controller
      this.activeAgents.set(agentId, {
        ...agent,
        abortController: newAbortController,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to interrupt agent ${agentId}:`, error);
      return false;
    }
  }
}
