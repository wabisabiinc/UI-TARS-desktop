// apps/agent-tars/src/renderer/src/components/ChatUI/StepCard.tsx
import { motion } from 'framer-motion';
import React from 'react';

interface StepCardProps {
  steps: string[];
}

export const StepCard: React.FC<StepCardProps> = ({ steps }) => (
  <div className="space-y-4 px-2">
    {steps.map((step, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.1 }}
      >
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-4">
          <div className="flex items-start space-x-2">
            <span className="font-bold text-lg">{i + 1}.</span>
            <span className="flex-1 text-base">{step}</span>
          </div>
        </div>
      </motion.div>
    ))}
  </div>
);
