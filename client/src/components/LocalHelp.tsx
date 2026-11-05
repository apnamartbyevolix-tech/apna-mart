import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export default function LocalHelp(){
  const status=trpc.localAssistant.status.useQuery(undefined,{retry:false,staleTime:60000});
  const [question,setQuestion]=useState('');
  const help=trpc.localAssistant.ask.useMutation();
  if(!status.data?.enabled)return null;
  return <section className="workspace-panel" aria-label="Local AI help">
    <div className="panel-heading"><div><h2>Ask MyTown · local AI help</h2><p>Learn how to use the app in English or Hinglish. This demo assistant cannot view or change your orders. Avoid entering private customer details.</p></div></div>
    <form className="application-form" onSubmit={e=>{e.preventDefault();help.mutate({question:question.trim()});}}>
      <label>Your question<textarea maxLength={1200} required rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Cash on Pickup order kaise banayein?"/></label>
      <Button type="submit" disabled={help.isPending||!question.trim()}>{help.isPending?'Local model is answering…':'Ask local assistant'}</Button>
    </form>
    {help.error&&<p role="alert">{help.error.message}</p>}
    {help.data&&<div role="status" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:16}}><strong>{help.data.source}</strong><p>{help.data.answer}</p></div>}
  </section>;
}
