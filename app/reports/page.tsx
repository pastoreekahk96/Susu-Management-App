import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import ThemeToggle from "../theme-toggle";
const money=(v:number)=>`${v.toLocaleString()} LD`;
const date=(v:Date)=>v.toLocaleDateString("en-LR",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
export default async function ReportsPage(){
 const user=await getCurrentUser(); if(!user) redirect("/login");
 const cycle=await prisma.cycle.findFirst({where:{status:"ACTIVE"},orderBy:{createdAt:"desc"},include:{weeks:{orderBy:{weekNumber:"asc"},include:{payments:{select:{expectedAmount:true,paidAmount:true,status:true}},payout:{select:{amount:true,selectionMethod:true}}}}}});
 if(!cycle)return <main className="shell"><section className="card"><h1>Reports</h1><p className="muted">No active SUSU cycle is available.</p></section></main>;
 const weeks=cycle.weeks.map(w=>{const due=w.payments.reduce((s,p)=>s+p.expectedAmount,0),paid=w.payments.reduce((s,p)=>s+p.paidAmount,0);return {...w,due,paid,balance:Math.max(0,due-paid),percent:due?Math.round(paid/due*100):0};});
 const totalDue=weeks.reduce((s,w)=>s+w.due,0),collected=weeks.reduce((s,w)=>s+w.paid,0),outstanding=Math.max(0,totalDue-collected),rate=totalDue?Math.round(collected/totalDue*100):0;
 const paidWeeks=weeks.filter(w=>w.status==="PAID").length,eligible=weeks.filter(w=>w.status==="ELIGIBLE").length,payouts=weeks.filter(w=>w.payout),payoutTotal=payouts.reduce((s,w)=>s+(w.payout?.amount??0),0);
 return <main className="shell">
  <header className="topbar"><div><p className="eyebrow">SUSU MANAGEMENT</p><h1>Reports</h1><p className="muted">{cycle.name} · financial and operational summary</p></div><div className="topbar-actions"><ThemeToggle /><Link className="button secondary" href="/">Dashboard</Link><Link className="button secondary" href="/weeks">Week history</Link></div></header>
  <section className="stats"><article><span>Total due</span><strong>{money(totalDue)}</strong></article><article><span>Collected</span><strong>{money(collected)}</strong></article><article><span>Outstanding</span><strong>{money(outstanding)}</strong></article><article><span>Collection rate</span><strong>{rate}%</strong></article></section>
  <section className="report-grid"><article className="card"><h2>Cycle summary</h2><p className="muted">Contribution performance across the active cycle.</p><div className="report-metrics"><div><span>Weekly target</span><strong>{money(cycle.weeklyPayoutAmount)}</strong></div><div><span>Weeks paid</span><strong>{paidWeeks} / {weeks.length}</strong></div><div><span>Eligible</span><strong>{eligible}</strong></div><div><span>Payouts recorded</span><strong>{payouts.length}</strong></div></div><div className="report-progress"><div style={{width:`${rate}%`}}/></div></article>
  <article className="card"><h2>Payout summary</h2><p className="muted">Weekly payout selections already recorded.</p><div className="report-metrics"><div><span>Total paid out</span><strong>{money(payoutTotal)}</strong></div><div><span>Random</span><strong>{payouts.filter(w=>w.payout?.selectionMethod==="RANDOM").length}</strong></div><div><span>Manual</span><strong>{payouts.filter(w=>w.payout?.selectionMethod==="MANUAL").length}</strong></div><div><span>Remaining</span><strong>{Math.max(0,weeks.length-paidWeeks)}</strong></div></div></article></section>
  <section className="card"><h2>Weekly collection report</h2><p className="muted">Read-only weekly totals. Use Current Week to record payments.</p><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Week</th><th>Period</th><th>Due</th><th>Collected</th><th>Outstanding</th><th>Progress</th><th>Status</th></tr></thead><tbody>{weeks.map(w=><tr key={w.id}><th>Week {w.weekNumber}</th><td>{date(w.startDate)} – {date(w.endDate)}</td><td>{money(w.due)}</td><td>{money(w.paid)}</td><td>{money(w.balance)}</td><td>{w.percent}%</td><td><span className={w.status==="PAID"?"status":w.status==="ELIGIBLE"?"status warning":"badge"}>{w.status}</span></td></tr>)}</tbody></table></div></section>
  <section className="rule"><strong>Report safety:</strong> this page is read-only and does not modify financial records.</section>
 </main>;
}