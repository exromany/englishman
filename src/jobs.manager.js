const schedule = require('node-schedule');
const moment = require('moment');
const mitt = require('mitt');

class JobsManager {
  constructor() {
    this.jobs = [];

    this.update = this.update.bind(this);
    this.resetJobs = this.resetJobs.bind(this);
    this.setReminders = this.setReminders.bind(this);
    this.remindChannelForFreeSpots = this.remindChannelForFreeSpots.bind(this);
    this.remindUsersBeforeLesson = this.remindUsersBeforeLesson.bind(this);

    this.emitter = mitt();
    this.on = this.emitter.on;
  }

  update(schedule) {
    const today = moment().startOf('day');
    const now = moment();
    this.resetJobs();
    schedule
      .filter(day => today.isSameOrBefore(day.date))
      .map(day => day.lessons)
      .reduce((list, items) => list.concat(items), [])
      .filter(lesson => now.isSameOrBefore(lesson.start))
      .forEach(this.setReminders)
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
    const date = moment(lesson.start).subtract(40, 'minutes').toDate();
    if (moment().isAfter(date)) {
      return;
    }
    const job = schedule.scheduleJob(date, () => {
      this.emitter.emit('remind_channel_before_lesson', lesson);
    });
    this.jobs.push(job);
    console.log('JM:set_reminder:channel', date);
  }

  remindUsersBeforeLesson(lesson) {
    const date = moment(lesson.start).subtract(5, 'minutes').toDate();
    if (moment().isAfter(date)) {
      return;
    }
    const job = schedule.scheduleJob(date, () => {
      this.emitter.emit('remind_users_before_lesson', lesson);
    });
    this.jobs.push(job);
    console.log('JM:set_reminder:users', date);
  }
}

module.exports = JobsManager;
