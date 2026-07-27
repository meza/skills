import * as styles from './Metric.module.css';

export function Metric({
  label,
  tone = 'muted',
  value
}: {
  label: string;
  tone?: 'muted' | 'pass' | 'primary';
  value: string;
}) {
  const toneClassName = {
    muted: '',
    pass: styles.passingValue,
    primary: styles.primaryValue
  }[tone];
  const valueClassName = toneClassName === '' ? styles.value : `${styles.value} ${toneClassName}`;

  return (
    <div className={styles.metric}>
      <span className={styles.label}>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  );
}
