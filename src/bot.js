const SlackBot = require('slackbots');
const nodefn = require('when/node');
const moment = require('moment');
const natural = require('natural');

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const MAX_SEATS = parseInt(process.env.MAX_SEATS, 10);

class Bot {
  constructor() {
    this.onMessage = this.onMessage.bind(this);
    this.remindChannel = this.remindChannel.bind(this);
    this.remindUsers = this.remindUsers.bind(this);
    this.remindUser = this.remindUser.bind(this);
    this.post = this.post.bind(this);

    this.bot = new SlackBot({ token: SLACK_TOKEN });
    this.bot.on('start', () => {
      this.channel = this.bot.channels.filter(channel => channel.is_member)[0];
    })
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
    }
    return this.bot.postMessage(id, text, messageParams);
  }

  remindChannel(lesson) {
    console.log('BOT:remind:channel', new Date(), lesson.start);
    const seats = lesson.users.length;
    const emptySeats = MAX_SEATS >= seats ? MAX_SEATS - seats : 0;
    if (!emptySeats) {
      return;
    }
    const text = `Next lesson have ${emptySeats} empty seats`;
    const attachments = [
      Object.assign(shortLessonDescription(lesson), {
        color: '#36a64f'
      })
    ];
    this.post(this.channel.id, text, attachments)
      .catch(this.logError);
  }

  remindUsers(lesson) {
    console.log('BOT:remind:users', new Date(), lesson.start);
    const channelUsers = this.bot.users
      .filter(user => this.channel.members.includes(user.id))
    lesson.users
      .slice(0, 5)
      .map(userName => findRelativeUser(userName, channelUsers))
      .filter(x => x)
      .forEach(user => this.remindUser(user, lesson));
  }

  remindUser(user, lesson) {
    console.log('BOT:remind:user', new Date(), user.real_name);
    const text = 'In a few minutes will begin lesson in which you are enrolled';
    const attachments = [
      Object.assign(shortLessonDescription(lesson), {
        color: '#d9edf7'
      })
    ];

    this.post(user.id, text, attachments)
      .catch(this.logError);
  }

  logError(error) {
    console.log('BOT:error', error)
  }
}

function shortLessonDescription(lesson) {
  return {
    title: `${moment(lesson.start).format('k:mm')} [${lesson.users.length}/${MAX_SEATS}]`,
    title_link: lesson.url,
    text: lesson.topic,
    footer: 'Google Sheets',
    footer_icon: 'https://www.google.com/sheets/about/favicon.ico'
  }
}

function findRelativeUser(searchedName, users) {
  const distance = natural.JaroWinklerDistance;
  console.log(searchedName);
  return users
    .map(user => {
      const altRealName = user.real_name.split(' ').reverse().join(' ');
      const dist = Math.max(distance(searchedName, user.real_name), distance(searchedName, altRealName));
      return {user, dist}
    })
    .sort((a, b) => b.dist - a.dist)
    .slice(0, 1)
    // .map(item => (console.log(item.user.real_name, ':', item.dist), item))
    .map(item => item.user)
    .shift()
}

module.exports = Bot;
