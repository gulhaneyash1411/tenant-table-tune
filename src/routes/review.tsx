import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { toast } from "sonner";
export const Route = createFileRoute("/review")({ component: ReviewPage });
function ReviewPage() {
  const t = new URLSearchParams(typeof window!=="undefined"?window.location.search:"").get("t");
  const [rating, setRating] = useState(5);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return toast.error("Missing tenant");
    if (!name.trim()) return toast.error("Name is required to submit feedback");
    const { error } = await supabase.from("reviews").insert({ tenant_id: t, customer_name: name, customer_phone: phone, rating, comment });
    if (error) return toast.error(error.message);
    setDone(true);
  }
  if (done) return <div className="min-h-screen grid place-items-center p-6"><Card className="p-8 text-center max-w-md"><h1 className="text-xl font-semibold">Thank you!</h1><p className="text-muted-foreground mt-2">Your feedback helps us serve you better.</p></Card></div>;
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="p-6 max-w-md w-full space-y-4">
        <h1 className="text-xl font-semibold">Rate your visit</h1>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-1">{[1,2,3,4,5].map(n => <button type="button" key={n} onClick={()=>setRating(n)}><Star className={`h-8 w-8 ${n<=rating?"fill-warning text-warning":"text-muted-foreground"}`}/></button>)}</div>
          <Input placeholder="Your name *" value={name} onChange={e=>setName(e.target.value)} required />
          <Input placeholder="Phone" value={phone} onChange={e=>setPhone(e.target.value)} />
          <Textarea placeholder="Comments (optional)" value={comment} onChange={e=>setComment(e.target.value)} />
          <Button className="w-full">Submit review</Button>
        </form>
      </Card>
    </div>
  );
}
