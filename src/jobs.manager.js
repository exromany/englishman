const schedule = require('node-schedule');
const moment = require('moment');
const mitt = require('mitt');

const logger = require('./logger');

const REMIND_CHANNEL_MINS = 45;
const REMIND_USER_MINS = 3;

class JobsManager {
  constructor() {
    this.log = logger.bind(logger, 'JM');
    this.emitter = mitt();
    this.on = this.emitter.on;

    this.jobs = [];

    this.update = this.update.bind(this);
    this.resetJobs = this.resetJobs.bind(this);
    this.setReminders = this.setReminders.bind(this);
    this.remindChannelForFreeSpots = this.remindChannelForFreeSpots.bind(this);
    this.remindUsersBeforeLesson = this.remindUsersBeforeLesson.bind(this);
  }

  update(lessons) {
    const now = moment();
    this.resetJobs();
    lessons
      .filter(lesson => now.isSameOrBefore(lesson.start))
      .forEach(this.setReminders);
  }

  resetJobs() {
    this.jobs.forEach(job => job.cancel());
    this.jobs = [];
  }

  setReminders(lesson) {
    this.remindChannelForFreeSpots(lesson);
    this.remindUsersBeforeLesson(lesson);
  }

  remindChannelForFreeSpots(lesson) {
    const date = moment(lesson.start).subtract(REMIND_CHANNEL_MINS, 'minutes').toDate();
    if (moment().isAfter(date)) {
      return;
    }
    const job = schedule.scheduleJob(date, () => {
      this.emitter.emit('remind_channel_before_lesson', lesson);
    });
    this.jobs.push(job);

    this.log('set:reminder:channel', date);
  }

  remindUsersBeforeLesson(lesson) {
    const date = moment(lesson.start).subtract(REMIND_USER_MINS, 'minutes').toDate();
    if (moment().isAfter(date)) {
      return;
    }
    const job = schedule.scheduleJob(date, () => {
      this.emitter.emit('remind_users_before_lesson', lesson);
    });
    this.jobs.push(job);

    this.log('set:reminder:users', date);
  }
}

module.exports = JobsManager;
