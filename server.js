const express = require("express");
const fs = require("fs");
const nodemailer = require("nodemailer");
const app = express();

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));

const DB = "./db.json";
const sessions = new Set();

// --- KONFIGURACIJA ---
const ADMIN_EMAIL = "tvoj-mejl@gmail.com"; 
const EMAIL_PASS = "tvoj app password"; 

const load = () => {
    if (!fs.existsSync(DB)) {
        fs.writeFileSync(DB, JSON.stringify({ 
            lessons: [], students: [], 
            config: { adminUser: "stefanmihajlovic", adminPass: "stefanmihajloviccc", email: ADMIN_EMAIL } 
        }));
    }
    let data = JSON.parse(fs.readFileSync(DB));
    data.students.forEach(s => { 
        if(!s.absences) s.absences = []; if(!s.grades) s.grades = [];
        if(!s.activity) s.activity = []; if(!s.behavior) s.behavior = [];
    });
    return data;
};
const save = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: ADMIN_EMAIL, pass: EMAIL_PASS }
});

// Fix za kose crte
app.use((req, res, next) => {
    if (req.path.substr(-1) === '/' && req.path.length > 1) res.redirect(301, req.path.slice(0, -1));
    else next();
});

function auth(req, res, next) {
    const publicPages = ["/login", "/forgot-password", "/recover"];
    if (publicPages.includes(req.path) || req.path.endsWith(".jpg")) return next();
    if (!sessions.has("admin")) return res.redirect("/login");
    next();
}
app.use(auth);

/* --- TVOJ LOGIN --- */
app.get("/login", (req, res) => {
    res.send(`
        <html lang="sr"><head><meta charset="UTF-8"><title>Login</title>
        <style>
            body { margin: 0; display: flex; justify-content: flex-start; align-items: center; height: 100vh; background: url('pozadina dnevnik.jpg') center/cover; font-family: sans-serif; }
            .login-container { margin-left: 8%; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); padding: 50px; border-radius: 30px; width: 350px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
            input { width: 100%; padding: 15px; margin: 10px 0; border: 1px solid #ddd; border-radius: 12px; box-sizing: border-box; }
            button { width: 100%; padding: 15px; border: none; border-radius: 12px; background: #2563eb; color: white; cursor: pointer; font-weight: bold; }
        </style></head>
        <body><div class="login-container"><h2>Prijavi se</h2><form method="POST"><input name="user" placeholder="Korisnik"><input name="pass" type="password" placeholder="Lozinka"><button>UĐI</button></form></div></body></html>
    `);
});

/* --- LAYOUT SA LINIJAMA I DUGMIĆIMA --- */
const layout = (title, content) => `
    <html lang="sr"><head><meta charset="UTF-8">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #f8fafc; display: flex; }
        .sidebar { width: 260px; height: 100vh; background: #0f172a; padding: 30px 20px; position: fixed; color: white; box-sizing: border-box; }
        .sidebar a { display: block; color: #94a3b8; text-decoration: none; padding: 12px; border-radius: 8px; margin-bottom: 5px; }
        .sidebar a:hover { background: rgba(255,255,255,0.1); color: white; }
        .main { flex: 1; margin-left: 260px; padding: 40px; }
        
        .card { background: white; padding: 20px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 15px; position: relative; overflow: hidden; }
        
        /* LINIE SA LEVE STRANE */
        .grade-line { border-left: 6px solid #3b82f6; }
        .activity-line { border-left: 6px solid #10b981; }
        .behavior-line { border-left: 6px solid #ef4444; }
        .absence-line { border-left: 6px solid #f59e0b; }
        
        .warning-box { background: #fee2e2; border: 1px solid #ef4444; color: #b91c1c; padding: 15px; border-radius: 12px; margin-bottom: 20px; font-weight: bold; }
        .btn { padding: 8px 15px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; }
        .btn-blue { background: #2563eb; color: white; }
        .btn-red { background: #ef4444; color: white; }
        input, select { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; width: 100%; margin-bottom: 10px; }
    </style></head>
    <body>
        <div class="sidebar">
            <h2 style="color:#3b82f6; text-align:center;">DNEVNIK</h2>
            <a href="/dashboard"><i class="fas fa-home"></i> Dashboard</a>
            <a href="/students"><i class="fas fa-users"></i> Spisak Đaka</a>
            <a href="/lesson/new"><i class="fas fa-plus"></i> Novi Čas</a>
            <a href="/logout" style="color:#f87171; margin-top:50px;"><i class="fas fa-sign-out-alt"></i> Izlaz</a>
        </div>
        <div class="main"><h1>${title}</h1>${content}</div>
    </body></html>`;

/* --- DASHBOARD (SA BRISANJEM ČASA I IZOSTANAKA) --- */
app.get("/dashboard", (req, res) => {
    const db = load();
    const sorted = db.lessons.sort((a, b) => parseInt(a.period) - parseInt(b.period));
    const html = sorted.map(l => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <div><b>${l.period}. čas</b> | ${l.subject}<br><small>${l.topic}</small></div>
            <form method="POST" action="/lesson/delete/${l.id}" style="margin:0;"><button class="btn btn-red"><i class="fas fa-trash"></i> Obriši</button></form>
        </div>`).join("");
    res.send(layout("Dnevni Raspored", html || "Nema časova."));
});

app.post("/lesson/delete/:id", (req, res) => {
    let db = load();
    const lid = req.params.id;
    db.lessons = db.lessons.filter(l => l.id != lid);
    // BRIŠE IZOSTANKE VEZANE ZA OVAJ ČAS
    db.students.forEach(s => { s.absences = s.absences.filter(a => a.lessonId != lid); });
    save(db);
    res.redirect("/dashboard");
});

/* --- ĐACI I STATISTIKA --- */
app.get("/students", (req, res) => {
    const db = load();
    const avg = (g) => g.length ? (g.reduce((a,b)=>a+parseInt(b.value),0)/g.length).toFixed(2) : "0.00";
    
    let stats = "";
    if (db.students.length) {
        const sorted = [...db.students].sort((a,b) => avg(b.grades) - avg(a.grades));
        stats = `<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; margin-bottom:20px;">
            <div class="card">Ukupno: ${db.students.length}</div>
            <div class="card" style="color:green;">Najbolji: ${sorted[0].name}</div>
            <div class="card" style="color:red;">Kritičan: ${sorted[sorted.length-1].name}</div>
        </div>`;
    }

    const list = db.students.map(s => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <span><b>${s.name}</b> (Prosek: ${avg(s.grades)})</span>
            <a href="/student/${s.id}" class="btn btn-blue">Otvori Profil</a>
        </div>`).join("");

    res.send(layout("Učenici", stats + `
        <button onclick="location.href='/student/'+${db.students.length ? db.students[Math.floor(Math.random()*db.students.length)].id : 0}" class="btn btn-blue" style="width:100%; margin-bottom:20px; background:#8b5cf6;">NASUMIČAN ODABIR</button>
        <div class="card"><form method="POST" action="/students/add" style="display:flex; gap:10px;"><input name="name" placeholder="Ime đaka"><button class="btn btn-blue">DODAJ</button></form></div>${list}`));
});

/* --- PROFIL SA LINIJAMA I UPOZORENJIMA --- */
app.get("/student/:id", (req, res) => {
    const db = load();
    const s = db.students.find(x => x.id == req.params.id);
    if (!s) return res.redirect("/students");

    let wrn = [];
    if (s.absences.length > 0) wrn.push(`Učenik ima ${s.absences.length} izostanaka!`);
    if (s.grades.filter(g=>g.value=="1").length >= 3) wrn.push(`Pazi: 3 ili više jedinica!`);
    const p = s.activity.filter(a=>a.value=="+").length;
    const m = s.activity.filter(a=>a.value=="-").length;
    if (p >= 3) wrn.push(`Učeniku se treba upisati ocena 5 za 3 plusa.`);
    if (m >= 3) wrn.push(`Učeniku se treba upisati ocena 1 za 3 minusa.`);

    const renderItem = (item, type, index) => `
        <div class="card ${type}-line" style="display:flex; justify-content:space-between; align-items:center;">
            <span><b>${item.value}</b> - ${item.note} <br><small>${item.date || ""}</small></span>
            <form method="POST" action="/student/${s.id}/delete-item/${type}/${index}" style="margin:0;"><button class="btn btn-red" style="padding:5px 10px;"><i class="fas fa-times"></i></button></form>
        </div>`;

    res.send(layout(s.name, `
        ${wrn.map(w => `<div class="warning-box"><i class="fas fa-exclamation-circle"></i> ${w}</div>`).join("")}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
            <div>
                <form method="POST" action="/student/${s.id}/add" class="card">
                    <h3>Novi unos</h3>
                    <select name="type"><option value="grades">Ocena</option><option value="activity">Aktivnost (+/-)</option><option value="behavior">Vladanje</option></select>
                    <input name="value" placeholder="Vrednost"><input name="note" placeholder="Napomena">
                    <button class="btn btn-blue" style="width:100%;">SAČUVAJ</button>
                </form>
                <form method="POST" action="/student/delete/${s.id}"><button class="btn btn-red" style="width:100%;">OBRIŠI UČENIKA</button></form>
            </div>
            <div>
                <h3>Dosije</h3>
                ${s.grades.map((i, idx) => renderItem(i, 'grade', idx)).join("")}
                ${s.activity.map((i, idx) => renderItem(i, 'activity', idx)).join("")}
                ${s.behavior.map((i, idx) => renderItem(i, 'behavior', idx)).join("")}
                ${s.absences.map((i, idx) => `
                    <div class="card absence-line" style="display:flex; justify-content:space-between;">
                        <span><b>IZOSTANAK</b> - ${i.date}</span>
                        <form method="POST" action="/student/${s.id}/delete-item/absences/${idx}" style="margin:0;"><button class="btn btn-red" style="padding:5px 10px;">X</button></form>
                    </div>`).join("")}
            </div>
        </div>
    `));
});

/* --- LOGIKA --- */
app.post("/login", (req, res) => {
    const db = load();
    if (req.body.user === db.config.adminUser && req.body.pass === db.config.adminPass) {
        sessions.add("admin"); return res.redirect("/dashboard");
    }
    res.send("Netačno.");
});

app.post("/student/:id/add", (req, res) => {
    let db = load(); const s = db.students.find(x => x.id == req.params.id);
    s[req.body.type].push({ value: req.body.value, note: req.body.note, date: new Date().toLocaleDateString() });
    save(db); res.redirect("/student/" + req.params.id);
});

app.post("/student/:id/delete-item/:type/:idx", (req, res) => {
    let db = load(); const s = db.students.find(x => x.id == req.params.id);
    s[req.params.type].splice(req.params.idx, 1);
    save(db); res.redirect("/student/" + req.params.id);
});

app.get("/lesson/new", (req, res) => {
    const db = load();
    const list = db.students.map(s => `<div><input type="checkbox" name="absent_ids" value="${s.id}"> ${s.name}</div>`).join("");
    res.send(layout("Novi Čas", `<form method="POST" action="/lesson/save" class="card"><input name="subject" placeholder="Predmet"><input name="topic" placeholder="Jedinica"><input name="period" type="number" placeholder="Čas br."><h4>Ko fali:</h4>${list}<button class="btn btn-blue" style="width:100%;">ZAVEDI ČAS</button></form>`));
});

app.post("/lesson/save", (req, res) => {
    let db = load(); const lid = Date.now();
    db.lessons.push({ id: lid, subject: req.body.subject, topic: req.body.topic, period: req.body.period });
    if (req.body.absent_ids) {
        const ids = Array.isArray(req.body.absent_ids) ? req.body.absent_ids : [req.body.absent_ids];
        db.students.forEach(s => { if (ids.includes(s.id.toString())) s.absences.push({ lessonId: lid, date: new Date().toLocaleDateString() }); });
    }
    save(db); res.redirect("/dashboard");
});

app.get("/logout", (req, res) => { sessions.clear(); res.redirect("/login"); });
app.get("/", (req, res) => res.redirect("/dashboard"));

app.listen(5000, () => console.log("Server: http://localhost:5000"));