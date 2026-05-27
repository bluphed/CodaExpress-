import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ToastProps {
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, x: '-50%', y: '-50%' }}
          animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
          exit={{ opacity: 0, scale: 0.8, x: '-50%', y: '-50%' }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-stone-900/95 dark:bg-stone-800/95 backdrop-blur-md text-white px-8 py-4 rounded-2xl shadow-2xl z-[10000] flex flex-col items-center gap-3 min-w-[240px] text-center border border-white/10"
        >
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-1">
            {toast.type === 'success' && <CheckCircle2 size={28} className="text-emerald-400" />}
            {toast.type === 'error' && <AlertCircle size={28} className="text-rose-400" />}
            {toast.type === 'info' && <Info size={28} className="text-blue-400" />}
          </div>
          <span className="text-base font-semibold leading-tight">{toast.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
