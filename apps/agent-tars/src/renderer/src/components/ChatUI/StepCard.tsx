import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@shadcn/ui/card';

interface StepCardProps {
  steps: string[];
}

export const StepCard: React.FC<StepCardProps> = ({ steps }) => (
  <div className="space-y-2">
    {steps.map((step, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.1 }}
      >
        <Card className="rounded-2xl shadow p-4">
          <CardContent className="flex items-start space-x-2">
            <span className="font-bold">{i + 1}.</span>
            <span>{step}</span>
          </CardContent>
        </Card>
      </motion.div>
    ))}
  </div>
);
