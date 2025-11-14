import { redirect } from 'next/navigation';

/**
 * Root page - redirects to /text tab
 */
export default function Home() {
  redirect('/text');
}
