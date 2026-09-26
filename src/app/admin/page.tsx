import { Console } from '@/components/Console';
import { AuthenticatedPage } from '@/components/AuthenticatedPage';
export default function AdminPage() { return <AuthenticatedPage><Console /></AuthenticatedPage>; }
