import { AIProviderSettings } from '../types/ai';

export const DEFAULT_USER_CONTEXT = `The user is a university student.

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
If a date, time, deadline, or link is uncertain or unavailable in the email, explicitly state that it is not specified.`;

export const DEFAULT_SETTINGS: AIProviderSettings = {
  activeProvider: 'ollama',
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b',
    temperature: 0.1,
    keepAlive: '5m'
  },
  gemini: {
    apiKey: '',
    model: 'gemini-1.5-flash'
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  userContextPrompt: DEFAULT_USER_CONTEXT
};

export const ACADEMIC_PLATFORMS = [
  'unstop.com',
  'hackerrank.com',
  'leetcode.com',
  'codechef.com',
  'codeforces.com',
  'canvas',
  'moodle',
  'blackboard.com',
  'classroom.google.com',
  'forms.gle',
  'docs.google.com/forms',
  'hirevue.com',
  'mettl.com',
  'wheebox.com',
  'superset.com',
  'joinsuperset.com',
  'shl.com',
  'cocubes.com',
  'myamcat.com',
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com',
  'webex.com',
  'calendly.com'
];

export const GMAIL_SEARCH_CATEGORIES = {
  ACADEMIC: '(exam OR test OR quiz OR assessment OR assignment OR submission OR "due date" OR deadline OR syllabus OR midterm OR finals OR grade OR lecture OR class OR course)',
  CAREER: '(placement OR internship OR "job application" OR "coding round" OR interview OR shortlist OR offer OR test OR assessment OR drive OR OA OR PPT OR testlink OR campus OR hiring OR recruitment OR "campus details" OR "eligible students" OR "placement cell" OR "tnp" OR company)',
  URGENT: '(urgent OR reminder OR "action required" OR "last date" OR "today" OR "tomorrow" OR closing OR overdue OR schedule OR process OR instructions)',
  GENERAL_FILTER: '-category:promotions -category:social -category:spam'
};
