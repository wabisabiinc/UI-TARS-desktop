<p align="center">
  <img alt="UI-TARS"  width="260" src="resources/icon.png">
</p>

# UI-TARS Desktop

UI-TARS Desktop is an GUI Agent application based on UI-TARS(Vision-Lanuage Model) that allows you to control your computer using natural language.

<p align="center">
        &nbsp&nbsp 📑 <a href="https://arxiv.org/abs/">Paper</a> &nbsp&nbsp
        | 🤗 <a href="https://huggingface.co/bytedance-research/UI-TARS-7B">Hugging Models</a>&nbsp&nbsp
        | &nbsp&nbsp 🤗 <a href="https://huggingface.co/spaces/">Spaces Demo</a> &nbsp&nbsp
<br>
🖥️ Desktop Application &nbsp&nbsp
| &nbsp&nbsp 🤗 <a href="">Midscene（Browser Use）</a>
</p>

## Demo Showcase

| Instruction  | Video |
| :---:  | :---: |
| Get the current weather in SF using the web browser      |    <video src="https://github.com/user-attachments/assets/5235418c-ac61-4895-831d-68c1c749fc87" height="300" />    |
| Send a twitter with the content "hello world"   | <video src="https://github.com/user-attachments/assets/737ccc11-9124-4464-b4be-3514cbced85c" height="300" />        |

## Features

- 🤖 Natural language control powered by Vision-Language Model
- 🖥️ Screenshot and visual recognition support
- 🎯 Precise mouse and keyboard control
- 💻 Cross-platform support (Windows/MacOS)
- 🔄 Real-time feedback and status display

## Quick Start

### Download

You can download the [latest release](https://github.com/bytedance/UI-TARS-desktop/releases/latest) version of UI-TARS Desktop from our releases page.

### Install

#### MacOS

1. Drag **UI TARS** application into the **Applications** folder
  ![](./images/mac_install.png)

2. Enable the permission of **UI TARS** in MacOS:
  - System Settings -> Privacy & Security -> **Accessibility**
  - System Settings -> Privacy & Security -> **Screen Recording**
  ![](./images/mac_permission.png)

3. Then open **UI TARS** application, you can see the following interface:
  ![](./images/mac_app.png)

> **Note**: If app broken, you can use `sudo xattr -dr com.apple.quarantine /Applications/UI\ TARS.app`  in Terminal to fix it.

#### Windows

**Still to run** the application, you can see the following interface:

![](./images/windows_install.png)

### Settings

#### VLM (Vision-Language Model)

Support **Hugging Face(Cloud)** and **Ollama(Local)** deployment.

![](./images/settings_model.png)

> **Note**: VLM Base Url is OpenAI compatible API endpoints, data format refer to [OpenAI Chat Completion API](https://platform.openai.com/docs/api-reference/chat/create).

## Development

Just simple two steps to run the application:

```bash
pnpm install
pnpm run dev
```

## System Requirements

- Node.js >= 20
- Supported Operating Systems:
  - Windows 10/11
  - macOS 10.15+

## License

UI-TARS Desktop is licensed under the Apache License 2.0.
