import {Link} from 'wouter';
import {useAuth} from '@/_core/hooks/useAuth';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';

export default function PrivacyPage({deletion=false}:{deletion?:boolean}) {
  const auth=useAuth();
  const request=trpc.support.create.useMutation();
  const contact='supportapnamart@gmail.com';
  return <div className="page-wrap"><div className="page-intro"><p className="eyebrow">APNA MART</p><h1>{deletion?'Request account deletion':'Your privacy'}</h1></div>
    <p>Operated by EVOLIX Studio. Support: <a href={`mailto:${contact}`}>{contact}</a> · <a href="tel:+919098173239">+91 9098173239</a></p>
    {deletion ? <section className="panel-card">
      <p>You can ask us to close your Apna Mart account and remove your saved profile and addresses. We verify account ownership before processing a request.</p>
      <p>Orders, payment records and related dispute records may need to be retained. A request does not cancel an active order or erase a shop’s invoice in Apna Galla.</p>
      {request.data ? <p role="status">Request received: {request.data.ticketNumber}. You can track it in <Link href="/support">Help & support</Link>.</p> : auth.user ? <Button disabled={request.isPending} onClick={()=>request.mutate({subject:'Account deletion request',message:'I request closure of my Apna Mart account and removal of my saved profile and addresses. Please verify ownership and tell me which transaction records need to remain.'})}>{request.isPending?'Sending request…':'Request account deletion'}</Button> : <p><Link href="/login">Sign in</Link> to submit a request tied to your account, or email <a href={`mailto:${contact}?subject=Apna%20Mart%20account%20deletion`}>{contact}</a> if you cannot sign in. Never send an OTP or password.</p>}
      {request.error&&<p role="alert">{request.error.message}</p>}
      <p>For questions or follow-up, contact <a href={`mailto:${contact}`}>{contact}</a>.</p>
    </section> : <section className="panel-card">
      <h2>Information used to fulfil your orders</h2><p>Apna Mart stores your verified mobile number, account name, saved addresses, orders and support requests. The fulfilling shop receives the order and the contact or delivery details needed to serve you.</p>
      <h2>Apna Galla connection</h2><p>Participating shop owners choose their public shop details and products. Their private purchase costs and financial accounts are not part of the public catalogue.</p>
      <h2>Sign-in and service providers</h2><p>Secure cookies keep you signed in. Our hosting and database providers process application data, and the SMS provider delivers sign-in codes. Keep sign-in and handover codes private.</p>
      <h2>Your choices</h2><p>You can edit your saved details, sign out, contact support or <Link href="/account-deletion">request account deletion</Link>. Transaction records may be retained to fulfil orders, resolve disputes and meet applicable recordkeeping requirements.</p>
      <p>Privacy and support contact: <a href={`mailto:${contact}`}>{contact}</a>.</p>
    </section>}
    <p><Link href="/">Back to shopping</Link> · <Link href={deletion?'/privacy':'/account-deletion'}>{deletion?'Privacy information':'Account deletion'}</Link></p>
  </div>;
}
