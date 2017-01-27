require('dotenv').config();

const ScheduleManager = require('./src/schedule.manager');
const JobsManager = require('./src/jobs.manager');
const Bot = require('./src/bot');

const schedule = new ScheduleManager();
const jobs = new JobsManager();
const bot = new Bot();

schedule.on('sync_done', jobs.update);
jobs.on('remind_channel_before_lesson', bot.remindChannel);
jobs.on('remind_users_before_lesson', bot.remindUsers);

console.log('MAIN:started', new Date());

schedule.recurrenceSync();
