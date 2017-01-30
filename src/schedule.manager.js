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
const DAY_ROWS = 9;

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
    if (!sheet.title.endsWith('week of the year')) {
      return undefined;
    }
    const url = ScheduleManager.getSheetUrl(sheet);
    const sheetId = sheet.id;

    const byDay = (num) => (cell) => cell.row >= (num - 1) * DAY_ROWS + 1 && cell.row <= num * DAY_ROWS;
    const byCol = (col) => (cell) => cell.col === col;
    const byRow = (row) => (cell) => cell.row % DAY_ROWS === row;
    const byRowGE = (row) => (cell) => cell.row % DAY_ROWS >= row;
    const byPos = (col, row) => (cell) => cell.col === col && cell.row % DAY_ROWS === row;
    const getValue = (cell) => cell ? cell.value : null;

    const readLesson = ({ url, sheetId, parseTime, trainer }) => (cells) => {
      const time = parseTime(getValue(cells.find(byRow(2))));
      return {
        start: time && time.start.date() || null,
        end: time && time.end && time.end.date() || null,
        topic: getValue(cells.find(byRow(3))),
        users: cells.filter(byRowGE(4)).map(cell => cell.value),
        trainer,
        cellCol: cells[0].col,
        cellRow: Math.floor((cells[0].row - 1) / DAY_ROWS) * DAY_ROWS + 1,
        sheetId,
        url
      };
    };

    const readDay = ({ url, sheetId }) => (cells) => {
      const trainer = getValue(cells.find(byPos(1, 1)));
      const date = chrono.parseDate(getValue(cells.find(byPos(2, 1))));
      const parseTime = (text) => chrono.parse(text.replace(/\./g, ':'), date)[0];

      return [1, 2, 3]
        .map(num => cells.filter(byCol(num)))
        .map(readLesson({ url, sheetId, parseTime, trainer }));
    };

    const readDays = ({ url, sheetId }) => (cells) => {
      return [1, 2]
        .map(num => cells.filter(byDay(num)))
        .map(readDay({ url, sheetId }))
        .reduce((list, items) => list.concat(items), []);
    };

    return lift(sheet.getCells)({ 'return-empty': false })
      .then(readDays({ url, sheetId }));
  }

  loadCells(lesson) {
    return this.docInit
      .then(doc => lift(doc.getCells)(lesson.sheetId, {
        'return-empty': true,
        'min-row': lesson.cellRow + 3,
        'max-row': lesson.cellRow + DAY_ROWS - 1,
        'min-col': lesson.cellCol,
        'max-col': lesson.cellCol
      }));
  }

  addUserToLesson(name, lesson) {
    return this.loadCells(lesson)
      .then(cells => cells.find(cell => !cell.value))
      .then(cell => cell && lift(cell.setValue)(name) || Promise.reject('No empty cells'))
      .then(() => this.log('user:add', name, lesson.start))
      .catch(err => (this.logError(err), Promise.reject(err)));
  }

  removeUserFromLesson(name, lesson){
    const shiftCells = (cell, index, list) => lift(cell.setValue)((list[index + 1] || { value: '' }).value);
    return this.loadCells(lesson)
      .then(cells => {
        const index = cells.findIndex(cell => cell.value === name);
        if (index < 0) {
          return Promise.reject('Name not found');
        }
        const lastIndex = cells.findIndex(cell => !cell.value) + 1 || DAY_ROWS;
        return Promise.all(cells.slice(index, lastIndex).map(shiftCells));
      })
      .then(() => this.log('user:remove', name, lesson.start))
      .catch(err => (this.logError(err), Promise.reject(err)));
  }

  findLessonByDate(date) {
    const m = moment(date);
    return this.lessons.find(lesson => m.isSame(lesson.start));
  }

  findLessonsByDateRange([date1, date2]) {
    const m1 = moment(date1);
    const m2 = moment(date2);
    return this.lessons
      .filter(lesson => m1.isSameOrBefore(lesson.start) && m2.isSameOrAfter(lesson.start));
  }

  static getSheetUrl(sheet) {
    return sheet._links['http://schemas.google.com/visualization/2008#visualizationApi'].replace('gviz/tq?','#');
  }
}

module.exports = ScheduleManager;
