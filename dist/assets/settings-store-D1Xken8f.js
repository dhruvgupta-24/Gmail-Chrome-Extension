const o=`The user is a university student.

Prioritize information related to:
- university notices and academic announcements
- tests, quizzes, exams, and assessments
- assignments, problem sets, and lab submissions
- deadlines and closing dates
- registrations and confirmation forms
- placements, campus drives, internships, and job applications
- coding rounds, hackathons, and technical assessments
- interviews (technical, HR, scheduling)
- important academic events and calendar dates

When the user asks what is important, prioritize urgent and actionable items.

Always prominently identify:
- things due today
- things due tomorrow
- upcoming deadlines
- tests, quizzes, and assessments
- required registrations or submissions

Deprioritize:
- marketing, discounts, and e-commerce promotions
- retail newsletters and social media notifications
- spam-like or irrelevant mass circulars

unless explicitly requested by the user.

Never invent information.
If a date, time, deadline, or link is uncertain or unavailable in the email, explicitly state that it is not specified.`,t={activeProvider:"ollama",ollama:{baseUrl:"http://localhost:11434",model:"qwen3:8b",temperature:.1,keepAlive:"5m"},gemini:{apiKey:"",model:"gemini-1.5-flash"},openai:{apiKey:"",baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"},userContextPrompt:o},m={ACADEMIC:'subject:(exam OR test OR quiz OR assessment OR assignment OR submission OR "due date" OR deadline OR syllabus OR midterm OR finals OR grade OR lecture OR class OR course)',CAREER:'subject:(placement OR internship OR "job application" OR "coding round" OR interview OR shortlist OR offer OR test OR assessment OR drive OR OA OR PPT OR testlink)',URGENT:'subject:(urgent OR reminder OR "action required" OR "last date" OR "today" OR "tomorrow" OR closing OR overdue)',GENERAL_FILTER:"-category:promotions -category:social -category:spam"},i="gmail_ai_assistant_settings";async function r(){return new Promise(a=>{if(typeof chrome>"u"||!chrome.storage||!chrome.storage.local){try{const e=localStorage.getItem(i);a(e?JSON.parse(e):t)}catch{a(t)}return}chrome.storage.local.get([i],e=>{e&&e[i]?a({...t,...e[i],ollama:{...t.ollama,...e[i].ollama||{}},gemini:{...t.gemini,...e[i].gemini||{}},openai:{...t.openai,...e[i].openai||{}}}):a(t)})})}async function c(a){const e=await r(),s={...e,...a,ollama:{...e.ollama,...a.ollama||{}},gemini:{...e.gemini,...a.gemini||{}},openai:{...e.openai,...a.openai||{}}};return new Promise(n=>{if(typeof chrome>"u"||!chrome.storage||!chrome.storage.local){try{localStorage.setItem(i,JSON.stringify(s))}catch{}n();return}chrome.storage.local.set({[i]:s},()=>{n()})})}export{o as D,m as G,t as a,r as g,c as s};
