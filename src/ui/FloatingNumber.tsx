import { motion } from 'framer-motion';
import styles from './FloatingNumber.module.css';

export type FloatingNumberProps = { value: number; kind: 'damage' | 'heal' | 'shield' };

export function FloatingNumber({ value, kind }: FloatingNumberProps) {
  const sign = kind === 'damage' ? '−' : '+';
  return (
    <motion.span
      className={`${styles.number} ${styles[kind]}`}
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 0, y: -32 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      {`${sign}${Math.abs(value)}`}
    </motion.span>
  );
}
