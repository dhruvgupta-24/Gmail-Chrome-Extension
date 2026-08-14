const e=`The user is a university student.

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
If a date, time, deadline, or link is uncertain or unavailable in the email, explicitly state that it is not specified.`,s={activeProvider:"ollama",ollama:{baseUrl:"http://localhost:11434",model:"llama3.2",temperature:.1,keepAlive:"5m"},gemini:{apiKey:"",model:"gemini-1.5-flash"},openai:{apiKey:"",baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"},userContextPrompt:e},i={ACADEMIC:'subject:(exam OR test OR quiz OR assessment OR assignment OR submission OR "due date" OR deadline OR syllabus OR midterm OR finals OR grade OR lecture OR class OR course)',CAREER:'subject:(placement OR internship OR "job application" OR "coding round" OR interview OR shortlist OR offer OR test OR assessment OR drive OR OA OR PPT OR testlink)',URGENT:'subject:(urgent OR reminder OR "action required" OR "last date" OR "today" OR "tomorrow" OR closing OR overdue)',GENERAL_FILTER:"-category:promotions -category:social -category:spam"};export{s as D,i as G,e as a};
