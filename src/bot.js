const SlackBot = require('slackbots');
const moment = require('moment');
const natural = require('natural');

const logger = require('./logger');

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const MAX_SPOTS = parseInt(process.env.MAX_SPOTS, 10) || 5;

class Bot {
  constructor() {
    this.log = logger('BOT');

    this.onMessage = this.onMessage.bind(this);
    this.remindChannel = this.remindChannel.bind(this);
    this.remindUsers = this.remindUsers.bind(this);
    this.remindUser = this.remindUser.bind(this);
    this.post = this.post.bind(this);
    this.logError = this.logError.bind(this);

    this.bot = new SlackBot({ token: SLACK_TOKEN });
    this.bot.on('start', () => {
      this.channel = this.bot.channels.filter(channel => channel.is_member)[0];
    });
    this.bot.on('message', this.onMessage);
  }

  onMessage(data) {
    if (data.type !== 'message' || data.bot_id) return;
    console.log(data);
  }

  post(id, text, attachments = []) {
    const messageParams = {
      attachments: attachments,
      as_user: true
    };
    return this.bot.postMessage(id, text, messageParams);
  }

  remindChannel(lesson) {
    const seats = lesson.users.length;
    const emptySeats = MAX_SPOTS >= seats ? MAX_SPOTS - seats : 0;
    if (!emptySeats) {
      this.log('remind:channel:skipped', this.channel.name);
      return;
    }
    this.log('remind:channel', this.channel.name);

    const text = 'There are empty spots the next lesson';
    const attachments = [
      Object.assign(Bot.shortLessonDescription(lesson), {
        color: '#36a64f'
      })
    ];
    this.post(this.channel.id, text, attachments)
      .catch(this.logError);
  }

  remindUsers(lesson) {
    this.log('remind:users', lesson.users.join(', '));

    const channelUsers = this.bot.users
      .filter(user => !user.deleted && !user.is_bot && this.channel.members.includes(user.id));
    lesson.users
      .slice(0, 5)
      .map(userName => Bot.findRelativeUser(userName, channelUsers))
      .filter(x => x)
      .forEach(user => this.remindUser(user, lesson));
  }

  remindUser(user, lesson) {
    this.log('remind:user', user.real_name);

    const text = 'In a few minutes will begin lesson in which you are enrolled';
    const attachments = [
      Object.assign(Bot.shortLessonDescription(lesson), {
        color: '#d9edf7'
      })
    ];

    this.post(user.id, text, attachments)
      .catch(this.logError);
  }

  logError(error) {
    this.log('error', error);
  }

  static shortLessonDescription(lesson) {
    return {
      title: `${moment(lesson.start).format('k:mm')} [persons ${lesson.users.length}/${MAX_SPOTS}]`,
      title_link: lesson.url,
      text: lesson.topic,
      footer: 'Google Sheets',
      footer_icon: 'https://www.google.com/sheets/about/favicon.ico'
    };
  }

  static findRelativeUser(searchedName, users) {
    const distance = natural.JaroWinklerDistance;
    return users
      .map(user => {
        const altRealName = user.real_name.split(' ').reverse().join(' ');
        const dist = Math.max(distance(searchedName, user.real_name), distance(searchedName, altRealName));
        return { user, dist };
      })
      .sort((a, b) => b.dist - a.dist)
      .slice(0, 1)
      .map(item => item.user)
      .shift();
  }
}

module.exports = Bot;
