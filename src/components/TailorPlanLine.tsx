import { Link } from 'react-router-dom';
import { describeTailorPlan, type TailorAccess } from '@/lib/tailor-access';

/** "Your plan" summary shared by Applications home and the workspace access card. */
export default function TailorPlanLine({ access, className = '' }: { access: TailorAccess; className?: string }) {
  const { text, free } = describeTailorPlan(access);
  return <p className={`tailor-plan-line ${className}`.trim()}><strong>Your plan:</strong> {text}{free && <> · <Link to="/pricing">See passes</Link></>}</p>;
}
