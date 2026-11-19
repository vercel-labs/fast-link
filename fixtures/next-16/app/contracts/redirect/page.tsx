import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Redirect(): never {
  redirect('/contracts/destination?from=redirect');
}
