import { redirect } from 'next/navigation';

/** Admins land on People (app flow section 2). */
export default function AdminHome() {
  redirect('/admin/people');
}
