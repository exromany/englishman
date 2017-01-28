const GoogleSpreadsheet = require('google-spreadsheet');
const { lift } = require('when/node');
const chrono = require('chrono-node');
const moment = require('moment');
const mitt = require('mitt');

const logger = require('./logger');

const SHEET_KEY = process.env.SHEET_KEY;
const CREDS = {
  client_email: process.env.GOOGLE_CREDS_EMAIL,
  private_key: (process.env.GOOGLE_CREDS_KEY || '').replace(/\\n/g, `\n`).replace(/^[\"\']+|[\"\']+$/g, '')
};
const SYNC_DELAY = parseInt(process.env.SYNC_DELAY, 10) || 60000;

class ScheduleManager {
  constructor() {
    this.emitter = mitt();
    this.on = this.emitter.on;
    this.log = logger.bind(logger, 'SM');
    this.logError = (error) => error && this.log('error', error);

    this.lessons = [];
    this.lastUpdateTime = null;

    this.recurrenceSync = this.recurrenceSync.bind(this);
    this.sync = this.sync.bind(this);
    this.loadSheet = this.loadSheet.bind(this);
    this.loadCells = this.loadCells.bind(this);
    this.addUserToLesson = this.addUserToLesson.bind(this);
    this.removeUserFromLesson = this.removeUserFromLesson.bind(this);

    const doc = new GoogleSpreadsheet(SHEET_KEY);
    this.docInit = lift(doc.useServiceAccountAuth)(CREDS)
      .then(() => doc);
  }

  recurrenceSync() {
    return this.sync()
      .then(() => setTimeout(this.recurrenceSync, SYNC_DELAY));
  }

  sync() {
    let updateTime;
    return this.docInit
      .then(doc => lift(doc.getInfo)())
      .then(data => {
        updateTime = chrono.strict.parseDate(data.updated);
        if (moment(this.lastUpdateTime).isSame(updateTime)) {
          return Promise.reject();
        }
        return data.worksheets;
      })
      .then(sheets => Promise.all(sheets.map(this.loadSheet)))
      .then(data => data.filter(x => x))
      .then(data => data.reduce((list, items) => list.concat(items), []))
      .then(lessons => lessons.sort((a, b) => a.start - b.start))
      .then(lessons => {
        this.lessons = lessons;
        this.lastUpdateTime = updateTime;

        this.log('sync:done');
        this.emitter.emit('sync_done', lessons);
      }, this.logError);
  }

  loadSheet(sheet) {
    const date = chrono.parseDate(sheet.title);
    if (!date) {
      return undefined;
    }
    const url = sheet._links['http://schemas.google.com/visualization/2008#visualizationApi'].replace('gviz/tq?','#');
    return lift(sheet.getCells)({ 'return-empty': false })
      .then(cells => {
        const lessons = {};
        cells.forEach(cell => {
          switch (cell.row) {
            case 1:
              const times = chrono.parse(cell.value.replace(/\./g, ':'), date);
              return lessons[cell.col] = {
                start: times && times.length && times[0].start.date() || null,
                end: times && times.length && times[0].end && times[0].end.date() || null,
                topic: '',
                users: [],
                url: url,
                sheetId: sheet.id,
                cellCol: cell.col
              };
            case 2: return lessons[cell.col] && (lessons[cell.col].topic = cell.value);
            default: return lessons[cell.col] && lessons[cell.col].users.push(cell.value);
          }
        });
        return Object.keys(lessons).map(col => lessons[col]);
      });
  }

  loadCells(lesson) {
    return this.docInit
      .then(doc => lift(doc.getCells)(lesson.sheetId, {
        'return-empty': true,
        'min-row': 3,
        'min-col': lesson.cellCol,
        'max-col': lesson.cellCol
      }));
  }

  addUserToLesson(name, lesson) {
    return this.loadCells(lesson)
      .then(cells => cells.find(cell => !cell.value))
      .then(cell => lift(cell.setValue)(name));
  }

  removeUserFromLesson(name, lesson){
    const shiftCells = (cell, index, list) => lift(cell.setValue)((list[index + 1] || { value: '' }).value);
    return this.loadCells(lesson)
      .then(cells => {
        const index = cells.findIndex(cell => cell.value === name);
        const lastIndex = cells.findIndex(cell => !cell.value);
        return Promise.all(cells.slice(index, lastIndex).map(shiftCells));
      });
  }
}

module.exports = ScheduleManager;
