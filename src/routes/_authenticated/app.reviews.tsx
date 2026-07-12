import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/app/reviews")({ component: Reviews });
function Reviews() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from("reviews").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || [])); }, []);
  const avg = rows.length ? (rows.reduce((a,b)=>a+b.rating,0)/rows.length) : 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reviews</h1>
      <Card className="p-6 flex items-center gap-4"><div className="text-4xl font-semibold">{avg.toFixed(1)}</div><div><div className="flex text-warning">{Array.from({length:5}).map((_,i)=><Star key={i} className={`h-4 w-4 ${i<Math.round(avg)?"fill-current":""}`}/>)}</div><div className="text-xs text-muted-foreground">{rows.length} reviews</div></div></Card>
      <div className="space-y-2">
        {rows.map(r => (
          <Card key={r.id} className="p-4">
            <div className="flex justify-between items-start">
              <div><div className="font-medium">{r.customer_name || "Guest"}</div><div className="text-xs text-muted-foreground">{format(new Date(r.created_at), "PPp")}</div></div>
              <div className="flex text-warning">{Array.from({length:5}).map((_,i)=><Star key={i} className={`h-4 w-4 ${i<r.rating?"fill-current":""}`}/>)}</div>
            </div>
            {r.comment && <div className="text-sm mt-2 text-muted-foreground">{r.comment}</div>}
          </Card>
        ))}
        {rows.length===0 && <div className="text-center text-muted-foreground py-8">No reviews yet.</div>}
      </div>
    </div>
  );
}