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
If a date, time, deadline, or link is uncertain or unavailable in the email, explicitly state that it is not specified.`,t={activeProvider:"ollama",ollama:{baseUrl:"http://localhost:11434",model:"qwen3:8b",temperature:.1,keepAlive:"5m"},gemini:{apiKey:"",model:"gemini-1.5-flash"},openai:{apiKey:"",baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"},userContextPrompt:o},c={ACADEMIC:'(exam OR test OR quiz OR assessment OR assignment OR submission OR "due date" OR deadline OR syllabus OR midterm OR finals OR grade OR lecture OR class OR course)',CAREER:'(placement OR internship OR "job application" OR "coding round" OR interview OR shortlist OR offer OR test OR assessment OR drive OR OA OR PPT OR testlink OR campus OR hiring OR recruitment OR "campus details" OR "eligible students" OR "placement cell" OR "tnp" OR company)',URGENT:'(urgent OR reminder OR "action required" OR "last date" OR "today" OR "tomorrow" OR closing OR overdue OR schedule OR process OR instructions)',GENERAL_FILTER:"-category:promotions -category:social -category:spam"},a="gmail_ai_assistant_settings";async function r(){return new Promise(i=>{if(typeof chrome>"u"||!chrome.storage||!chrome.storage.local){try{const e=localStorage.getItem(a);i(e?JSON.parse(e):t)}catch{i(t)}return}chrome.storage.local.get([a],e=>{e&&e[a]?i({...t,...e[a],ollama:{...t.ollama,...e[a].ollama||{}},gemini:{...t.gemini,...e[a].gemini||{}},openai:{...t.openai,...e[a].openai||{}}}):i(t)})})}async function m(i){const e=await r(),s={...e,...i,ollama:{...e.ollama,...i.ollama||{}},gemini:{...e.gemini,...i.gemini||{}},openai:{...e.openai,...i.openai||{}}};return new Promise(n=>{if(typeof chrome>"u"||!chrome.storage||!chrome.storage.local){try{localStorage.setItem(a,JSON.stringify(s))}catch{}n();return}chrome.storage.local.set({[a]:s},()=>{n()})})}export{o as D,c as G,t as a,r as g,m as s};
