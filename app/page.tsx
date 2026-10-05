import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { prisma } from "../lib/prisma";
import SignOutButton from "./sign-out-button";

const fallbackMembers = [["Kumba Fayah",4],["Daniel Moore",1],["Abraham Tarplah",1],["Randall Blakepeh",1],["Deborah Tokpah",2],["Kumbah Ukaegbu",10],["Wisdom Tarplah",2],["Cecelia Ukaegbu",3],["Judith Idee",2],["Bendu Garseeda",2],["Maron Dahn",4],["Christina",2],["Fallah Fayiah",4],["P. Arthur",5],["Rachel Fayiah",4]] as const;
const money=(value:number)=>`${value.toLocaleString()} LD`;
function day(date:Date){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));}
function fmt(date:Date, options:Intl.DateTimeFormatOptions={month:"short",day:"numeric"}){return date.toLocaleDateString("en-LR",{...options,timeZone:"UTC"});}

export default async function Home(){
 const user=await getCurrentUser(); if(!user) redirect("/login");
 let cycle:any=null, databaseReady=false;
 if(process.env.DATABASE_URL){try{cycle=await prisma.cycle.findFirst({where:{status:"ACTIVE"},orderBy:{createdAt:"desc"},include:{members:{orderBy:{nameSnapshot:"asc"},select:{nameSnapshot:true,handsCount:true}},weeks:{orderBy:{weekNumber:"asc"},include:{payments:{select:{expectedAmount:true,paidAmount:true,status:true,dayIndex:true}}}}}});databaseReady=true;}catch{}}
 const members=cycle?.members.map((m:any)=>[m.nameSnapshot,m.handsCount] as const)??fallbackMembers;
 const totalHands=cycle?.totalHandsSnapshot??members.reduce((s:number,[,h]:readonly [string,number])=>s+h,0), dailyTotal=totalHands*50, weeklyTotal=cycle?.weeklyPayoutAmount??dailyTotal*7;
 const today=day(new Date()), currentWeek=cycle?.weeks.find((w:any)=>today>=day(w.startDate)&&today<=day(w.endDate));
 const due=currentWeek?.payments.reduce((s:number,p:any)=>s+p.expectedAmount,0)??0, paid=currentWeek?.payments.reduce((s:number,p:any)=>s+p.paidAmount,0)??0;
 const balance=Math.max(0,due-paid), progress=due?Math.min(100,Math.round(paid/due*100)):0;
 const incomplete=currentWeek?.payments.filter((p:any)=>p.status!=="PAID").length??0;
 const idx=currentWeek?Math.min(6,Math.max(0,Math.floor((today.getTime()-day(currentWeek.startDate).getTime())/86400000))):0;
 const todayDue=currentWeek?.payments.filter((p:any)=>p.dayIndex===idx).reduce((s:number,p:any)=>s+p.expectedAmount,0)??0;
 const todayPaid=currentWeek?.payments.filter((p:any)=>p.dayIndex===idx).reduce((s:number,p:any)=>s+p.paidAmount,0)??0;
 const payoutReady=currentWeek?.status==="ELIGIBLE", paidWeeks=cycle?.weeks.filter((w:any)=>w.status==="PAID").length??0;
 const cycleProgress=cycle?.weeks.length?Math.round(paidWeeks/cycle.weeks.length*100):0, canAdmin=user.role==="ADMIN";
 const topMembers=[...members].sort((a,b)=>b[1]-a[1]).slice(0,5);
 return <main className="dashboard-shell">
  <aside className="dashboard-sidebar"><div className="brand"><div className="brand-mark">S</div><div><strong>SUSU</strong><span>Management</span></div></div>
   <nav className="dashboard-nav"><Link className="nav-item active" href="/">Overview</Link><Link className="nav-item" href="/current-week">Current week</Link><Link className="nav-item" href="/members">Members</Link><Link className="nav-item" href="/weeks">Week history</Link>{canAdmin&&<><Link className="nav-item" href="/audit">Audit log</Link><Link className="nav-item" href="/payouts">Payouts</Link><Link className="nav-item" href="/payouts/history">Payout history</Link></>}</nav>
   <div className="sidebar-bottom"><div className={databaseReady?"connection-pill online":"connection-pill"}><span className="connection-dot"/>{databaseReady?"Database connected":"Database setup needed"}</div><div className="user-mini"><div className="avatar">{user.name.slice(0,1).toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role}</span></div></div><SignOutButton/></div>
  </aside>
  <section className="dashboard-main">
   <header className="dashboard-header"><div><span className="dashboard-kicker">OVERVIEW</span><h1>Good day, {user.name.split(" ")[0]}</h1><p>Here is the current state of your SUSU cycle.</p></div><div className="dashboard-header-actions"><span className="date-chip">{fmt(today,{weekday:"long",month:"short",day:"numeric",year:"numeric"})}</span><Link className="primary-action" href="/current-week">Open current week</Link></div></header>
   {!databaseReady&&<section className="dashboard-alert"><strong>Database connection needs attention</strong><p>Temporary fallback data is being displayed until the PostgreSQL connection is available.</p></section>}
   <section className="kpi-grid"><article className="kpi-card featured"><span>Current week</span><strong>{currentWeek?`Week ${currentWeek.weekNumber}`:"—"}</strong><small>{currentWeek?`${fmt(currentWeek.startDate)} – ${fmt(currentWeek.endDate)}`:"No active week"}</small></article><article className="kpi-card"><span>Collected</span><strong>{money(paid)}</strong><small>{progress}% of {money(due)} due</small></article><article className="kpi-card"><span>Outstanding</span><strong>{money(balance)}</strong><small>{incomplete} incomplete daily records</small></article><article className="kpi-card"><span>Cycle progress</span><strong>{cycleProgress}%</strong><small>{paidWeeks} of {cycle?.weeks.length??47} payouts completed</small></article></section>
   <section className="dashboard-grid"><article className="dashboard-card collection-card"><div className="card-head"><div><span className="card-eyebrow">THIS WEEK</span><h2>Collection progress</h2></div><span className={payoutReady?"state-pill ready":"state-pill"}>{payoutReady?"Ready for payout":currentWeek?.status??"No week"}</span></div><div className="collection-total"><strong>{money(paid)}</strong><span>of {money(due)} collected</span></div><div className="modern-progress"><div style={{width:`${progress}%`}}/></div><div className="collection-meta"><span>{progress}% complete</span><span>{money(balance)} remaining</span></div><div className="today-panel"><div><span>Today</span><strong>{money(todayPaid)}</strong><small>of {money(todayDue)} collected</small></div><div className="today-bar"><div style={{width:`${todayDue?Math.min(100,Math.round(todayPaid/todayDue*100)):0}%`}}/></div></div><div className="card-actions"><Link className="primary-action" href="/current-week">Manage payments</Link>{payoutReady&&canAdmin&&<Link className="text-action" href="/payouts">Review payout →</Link>}</div></article>
    <article className="dashboard-card quick-card"><div className="card-head"><div><span className="card-eyebrow">SHORTCUTS</span><h2>Quick actions</h2></div></div><Link className="quick-action" href="/current-week"><span className="quick-icon">₤</span><div><strong>Record contribution</strong><small>Update today&apos;s payments</small></div><b>→</b></Link><Link className="quick-action" href="/members"><span className="quick-icon">+</span><div><strong>Manage members</strong><small>View or update the register</small></div><b>→</b></Link><Link className="quick-action" href="/weeks"><span className="quick-icon">▦</span><div><strong>Review weeks</strong><small>See the full cycle history</small></div><b>→</b></Link>{canAdmin&&<Link className="quick-action" href="/payouts/history"><span className="quick-icon">↗</span><div><strong>Payout history</strong><small>Review completed payouts</small></div><b>→</b></Link>}</article>
   </section>
   <section className="dashboard-grid lower"><article className="dashboard-card"><div className="card-head"><div><span className="card-eyebrow">CYCLE</span><h2>Cycle at a glance</h2></div><span className="soft-pill">{totalHands} hands</span></div><div className="cycle-summary"><div><strong>{members.length}</strong><span>Members</span></div><div><strong>{money(dailyTotal)}</strong><span>Daily target</span></div><div><strong>{money(weeklyTotal)}</strong><span>Weekly payout</span></div></div><div className="cycle-bar"><div style={{width:`${cycleProgress}%`}}/></div><div className="cycle-bar-label"><span>{paidWeeks} weeks paid</span><span>{cycle?.weeks.length??47} total weeks</span></div></article>
    <article className="dashboard-card"><div className="card-head"><div><span className="card-eyebrow">MEMBERS</span><h2>Largest hand positions</h2></div><Link className="text-action" href="/members">View all →</Link></div><div className="member-mini-list">{topMembers.map(([name,hands])=><div className="member-mini" key={name}><div className="member-avatar">{name.slice(0,1).toUpperCase()}</div><div><strong>{name}</strong><span>{hands} {hands===1?"hand":"hands"}</span></div><b>{money(hands*50)}<small>/day</small></b></div>)}</div></article>
   </section>
   <footer className="dashboard-footer"><span>47-hand SUSU cycle · 50 LD per hand per day</span><span>One hand selected per weekly payout</span></footer>
  </section>
 </main>;
}
