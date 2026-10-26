import { Link } from 'react-router-dom';
import './ProductNavigation.css';

export default function ProductNavigation({ active }: { active: 'loop' | 'check' }) {
  return <nav className="product-navigation" aria-label="Choose a product">
    <Link to="/loop" aria-current={active === 'loop' ? 'page' : undefined}><strong>Automated Job Loop</strong><span>Find jobs and prepare tailored CVs on your schedule.</span></Link>
    <Link to="/check" aria-current={active === 'check' ? 'page' : undefined}><strong>CV Check</strong><span>Check your CV against a job you already found.</span></Link>
  </nav>;
}
