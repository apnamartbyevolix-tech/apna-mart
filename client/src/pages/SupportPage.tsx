import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, CircleHelp, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, IntegrationNote, QueryState } from "@/components/MarketCards";
import { LoginButton, useMarket } from "@/components/MarketChrome";
import { trpc } from "@/lib/trpc";
import { titleCase } from "@/lib/marketplace";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" ? value as Record<string, any> : {};
const ticketIdOf = (ticket: unknown) => {
  const row = asRecord(ticket);
  const id = row.ticketId ?? row.id;
  return Number.isSafeInteger(Number(id)) ? Number(id) : undefined;
};
const dateLabel = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function SupportPage() {
  const { auth } = useMarket();
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number>();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [orderId, setOrderId] = useState("");
  const ticketsQ = trpc.support.mine.useQuery(undefined, {
    enabled: Boolean(auth.user), retry: false,
  });
  const ordersQ = trpc.marketplace.myOrders.useQuery(undefined, {
    enabled: Boolean(auth.user), retry: false,
  });
  const threadQ = trpc.support.thread.useQuery(
    { ticketId: selectedId ?? -1 },
    { enabled: Boolean(auth.user && selectedId), retry: false }
  );
  const create = trpc.support.create.useMutation({
    onSuccess: async result => {
      const createdId = ticketIdOf(result);
      setSubject("");
      setMessage("");
      setOrderId("");
      toast.success("Support ticket created. Replies will appear here.");
      await utils.support.mine.invalidate();
      if (createdId) {
        setSelectedId(createdId);
        await utils.support.thread.invalidate({ ticketId: createdId });
      }
    },
    onError: error => toast.error(error.message),
  });
  const sendReply = trpc.support.reply.useMutation({
    onSuccess: async () => {
      setReply("");
      toast.success("Reply added to your ticket");
      await Promise.all([
        utils.support.mine.invalidate(),
        ...(selectedId ? [utils.support.thread.invalidate({ ticketId: selectedId })] : []),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const orders = ordersQ.data ?? [];
  const thread = asRecord(threadQ.data);
  const ticket = asRecord(thread.ticket ?? thread);
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const status = String(ticket.status ?? "open");
  const isClosed = status === "resolved" || status === "closed";

  if (auth.loading)
    return <div className="page-wrap"><QueryState loading /></div>;
  if (!auth.user)
    return (
      <div className="page-wrap">
        <Link href="/account" className="back-link"><ArrowLeft /> Account</Link>
        <div className="account-hero">
          <span className="account-avatar"><CircleHelp /></span>
          <p className="eyebrow">CUSTOMER SUPPORT</p>
          <h1>Sign in to contact support.</h1>
          <p>Support conversations are private to the signed-in customer.</p>
          <LoginButton>Sign in securely</LoginButton>
        </div>
      </div>
    );

  return (
    <div className="page-wrap">
      <Link href="/account" className="back-link"><ArrowLeft /> Account</Link>
      <div className="page-intro">
        <p className="eyebrow">CUSTOMER CARE</p>
        <h1>Help & support</h1>
        <p>Create an in-app ticket and continue the conversation here.</p>
      </div>
      <IntegrationNote title="In-app support only">
        Ticket updates are shown on this page. SMS and email notifications are not connected.
      </IntegrationNote>

      <section className="workspace-panel">
        <h2>Start a support ticket</h2>
        <form className="application-form" onSubmit={event => {
          event.preventDefault();
          const selectedOrder = Number(orderId);
          create.mutate({
            subject: subject.trim(),
            message: message.trim(),
            ...(orderId && orders.some(row => row.order.id === selectedOrder) ? { orderId: selectedOrder } : {}),
          });
        }}>
          <label>Subject<input required minLength={3} maxLength={180} value={subject} onChange={event => setSubject(event.target.value)} /></label>
          <label>How can we help?<textarea required minLength={2} maxLength={5000} rows={5} value={message} onChange={event => setMessage(event.target.value)} /></label>
          {orders.length > 0 && (
            <label>Related order (optional)
              <select value={orderId} onChange={event => setOrderId(event.target.value)}>
                <option value="">No order link</option>
                {orders.map(({ order, shopName }) => <option key={order.id} value={order.id}>{order.orderNumber} · {shopName}</option>)}
              </select>
              <small>Only your own recent orders can be linked.</small>
            </label>
          )}
          {ordersQ.error && <p className="summary-small" role="status">Recent orders could not be loaded, so this ticket will not be linked to an order.</p>}
          <Button type="submit" disabled={create.isPending || !subject.trim() || !message.trim()}>
            <Send /> {create.isPending ? "Creating ticket…" : "Create ticket"}
          </Button>
          {create.error && <p role="alert">{create.error.message}</p>}
        </form>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading"><div><h2>Your tickets</h2><p>Private ticket history for this account.</p></div></div>
        <QueryState loading={ticketsQ.isLoading} error={ticketsQ.error}>
          {ticketsQ.data && (ticketsQ.data.length ? (
            <div className="admin-list">
              {ticketsQ.data.map((item: unknown) => {
                const row = asRecord(item);
                const id = ticketIdOf(row);
                const active = id === selectedId;
                return <button type="button" className={`admin-list-row support-ticket-select${active ? " selected" : ""}`} key={id ?? row.ticketNumber ?? row.subject} onClick={() => id && setSelectedId(id)} disabled={!id}>
                  <span><strong>{row.ticketNumber ? `${row.ticketNumber} · ` : ""}{row.subject ?? "Support ticket"}</strong><small>{row.status ? titleCase(String(row.status)) : "Open"}{row.updatedAt ? ` · Updated ${dateLabel(row.updatedAt)}` : ""}</small></span>
                  <ArrowRight aria-hidden="true" />
                </button>;
              })}
            </div>
          ) : <EmptyState icon={MessageSquareText} title="No support tickets yet">Create a ticket above and your private conversation will appear here.</EmptyState>)}
        </QueryState>
      </section>

      {selectedId && (
        <section className="workspace-panel" aria-live="polite">
          <div className="panel-heading"><div><h2>{ticket.subject ?? "Ticket conversation"}</h2><p>{ticket.ticketNumber ? `${ticket.ticketNumber} · ` : ""}{status ? titleCase(status) : ""}{ticket.orderId ? ` · Order #${ticket.orderId}` : ""}</p></div></div>
          <QueryState loading={threadQ.isLoading} error={threadQ.error}>
            {threadQ.data && <>
              <div className="support-thread">
                {messages.length ? messages.map((entry: unknown, index: number) => {
                  const row = asRecord(entry);
                  const text = row.message ?? row.body ?? row.content ?? "";
                  const role = row.senderRole ?? row.authorRole ?? row.role ?? "support";
                  return <article className="support-message" key={row.id ?? index}>
                    <div><strong>{titleCase(String(role))}</strong><small>{dateLabel(row.createdAt)}</small></div>
                    <p>{String(text)}</p>
                  </article>;
                }) : <p className="soft-empty">No messages in this ticket yet.</p>}
              </div>
              {isClosed ? <p className="summary-small">This ticket is {titleCase(status)} and cannot receive replies.</p> : (
                <form className="application-form" onSubmit={event => { event.preventDefault(); sendReply.mutate({ ticketId: selectedId, message: reply.trim() }); }}>
                  <label>Your reply<textarea required minLength={2} maxLength={5000} rows={4} value={reply} onChange={event => setReply(event.target.value)} /></label>
                  <Button type="submit" disabled={sendReply.isPending || !reply.trim()}><Send /> {sendReply.isPending ? "Sending…" : "Send reply"}</Button>
                  {sendReply.error && <p role="alert">{sendReply.error.message}</p>}
                </form>
              )}
            </>}
          </QueryState>
        </section>
      )}
    </div>
  );
}
