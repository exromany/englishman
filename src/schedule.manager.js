const GoogleSpreadsheet = require('google-spreadsheet');
const nodefn = require('when/node');
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
    this.log = logger('SM');

    this.schedule = null;
    this.lastUpdateTime = null;

    this.recurrenceSync = this.recurrenceSync.bind(this);
    this.sync = this.sync.bind(this);
    this.loadSheet = this.loadSheet.bind(this);
    this.logError = this.logError.bind(this);

    const doc = new GoogleSpreadsheet(SHEET_KEY);
    this.docInit = nodefn.lift(doc.useServiceAccountAuth)(CREDS)
      .then(() => doc);
  }

  recurrenceSync() {
    return this.sync()
      .then(() => setTimeout(this.recurrenceSync, SYNC_DELAY));
  }

  sync() {
    let updateTime;
    return this.docInit
      .then(doc => nodefn.lift(doc.getInfo)())
      .then(data => {
        updateTime = chrono.strict.parseDate(data.updated);
        if (moment(this.lastUpdateTime).isSame(updateTime)) {
          return Promise.reject();
        }
        return data.worksheets;
      })
      .then(sheets => Promise.all(sheets.map(this.loadSheet)))
      .then(data => data.filter(x => x))
      .then(data => {
        this.schedule = data;
        this.lastUpdateTime = updateTime;

        this.log('sync:done');
        this.emitter.emit('sync_done', data);
      }, this.logError);
  }

  loadSheet(sheet) {
    const date = chrono.parseDate(sheet.title);
    if (!date) {
      return undefined;
    }
    const url = sheet._links['http://schemas.google.com/visualization/2008#visualizationApi'].replace('gviz/tq?','#');
    return nodefn.lift(sheet.getCells)({ 'return-empty': false })
      .then(cells => {
        const lessons = {};
        cells.forEach(cell => {
          switch (cell.row) {
            case 1:
              const times = chrono.parse(cell.value.replace(/\./g, ':'), date);
              return lessons[cell.col] = {
                title: cell.value,
                start: times && times.length && times[0].start.date() || null,
                end: times && times.length && times[0].end && times[0].end.date() || null,
                topic: '',
                url: url,
                users: []
              };
            case 2: return lessons[cell.col] && (lessons[cell.col].topic = cell.value);
            default: return lessons[cell.col] && lessons[cell.col].users.push(cell.value);
          }
        });
        return Object.keys(lessons).map(col => lessons[col]);
      })
      .then(lessons => ({
        id: sheet.id,
        title: sheet.title,
        url: url,
        date: date,
        lessons: lessons
      }));
  }

  logError(error) {
    if (!error) return;
    this.log('sync:error', error);
  }
}

module.exports = ScheduleManager;
