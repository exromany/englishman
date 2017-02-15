const SlackBot = require('slackbots');
const moment = require('moment');
const natural = require('natural');
const uniqueRandomArray = require('unique-random-array');

const Analizer = require('./analizer');
const logger = require('./logger');
const greetings = require('./greetings.json');
const helpMessage = require('./help.json');

const randomHi = uniqueRandomArray(greetings);

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const MAX_SPOTS = parseInt(process.env.MAX_SPOTS, 10) || 5;

class Bot {
  constructor(schedule) {
    this.log = logger.bind(logger, 'BOT');
    this.logError = (error) => this.log('error', error);

    this.onMessage = this.onMessage.bind(this);
    this.remindChannel = this.remindChannel.bind(this);
    this.remindUsers = this.remindUsers.bind(this);
    this.remindUser = this.remindUser.bind(this);
    this.post = this.post.bind(this);

    this.schedule = schedule;
    this.analizer = new Analizer();
    this.bot = new SlackBot({ token: SLACK_TOKEN });
    this.bot.on('start', () => {
      this.channel = this.bot.channels.filter(channel => channel.is_member)[0];
      this.selfId = this.bot.self.id;
      this.selfNames = ['englishman', 'english_man', 'english-man', `<@${this.selfId.toLowerCase()}>`];
    });
    this.bot.on('message', this.onMessage);
    this.bot.on('open', this.log.bind(this, 'connection:open'));
    this.bot.on('error', this.log.bind(this, 'connection:error'));
    this.bot.on('close', this.log.bind(this, 'connection:close'));
  }

  onMessage(data) {
    if (data.type !== 'message' || data.subtype || data.bot_id || !data.text) return;
    this.log(`message:${this.getUserById(data.user).name}`, data);

    const text = (data.text || '').toLowerCase().trim();

    const isDirectMessage = data.channel.startsWith('D');
    const botCalled = isDirectMessage || this.selfNames.some(name => text.includes(name));

    this.analizer.analize(text)
      .then(({ action, date }) => {
        this.log('message:parsed', { action, date: date && date.start.date() });

        const matchWhoIs = text.match(/^who is (.+)$/);
        if (botCalled && matchWhoIs) {
          return this.sayWhoIs(data.channel, matchWhoIs[1]);
        }
        if (botCalled && action === 'help') {
          return this.sayHelp(data.channel);
        }
        if (botCalled && action === 'hello') {
          return this.sayHi(data.channel);
        }
        if (botCalled && action === 'enroll') {
          return this.enroll(data.channel, data.user, date && date.start);
        }
        if (botCalled && action === 'unenroll') {
          return this.unenroll(data.channel, data.user, date && date.start);
        }
        if (botCalled || text.includes('schedule')) {
          return this.postSchedule(data.channel, date && date.start.date());
        }
        if (botCalled) {
          return this.sayHi(data.channel);
        }
      });
  }

  sayHelp(channelId) {
    this.post(channelId, null, helpMessage)
      .catch(this.logError);
  }

  sayHi(channelId) {
    const text = `${randomHi()}\nAsk me for schedule!`;

    this.post(channelId, text)
      .catch(this.logError);
  }

  sayWhoIs(channelId, userName) {
    const channelUsers = this.getChannelUsers();
    const user = Bot.findRelativeUser(userName, channelUsers);

    const text = `\`${userName}\` is recognized as \`${user.real_name}\``;
    this.post(channelId, text)
      .catch(this.logError);
  }

  postSchedule(channelId, date) {
    const day = moment(date);
    const dayFormat = day.format('dddd, MMMM Do');
    let text = `Lessons on ${dayFormat}`;

    const d1 = day.clone().startOf('day');
    const d2 = day.clone().endOf('day');
    const lessons = this.schedule.findLessonsByDateRange([d1, d2]);

    if (!lessons.length && date) {
      text = `There are no lessons on ${dayFormat}`;
    } else if (!lessons.length) {
      const nextLesson = this.schedule.lessons.find(l => day.isSameOrBefore(l.start));
      const nextDate = nextLesson && nextLesson.start;
      if (nextDate) {
        return this.postSchedule(channelId, nextDate);
      } else {
        text = `There are no timetable`;
      }
    }

    const attachments = lessons.map(Bot.shortLessonDescription);

    this.post(channelId, text, attachments)
      .catch(this.logError);
  }

  enroll(channelId, userId, date) {
    if (!date || date.knownValues.hour === undefined) {
      return this.post(channelId, `Please, specify time`);
    }
    const userToEnroll = this.getUserById(userId);

    const time = moment(date && date.date()).startOf('hour');
    const lesson = this.schedule.findLessonByDate(time);

    if (!lesson) {
      return this.post(channelId, `I can't find lesson at this time: ${time.format('dddd, MMMM Do, k:mm')}`);
    }

    const users = this.getChannelUsers();
    const enrolledUsers = lesson.users.map(user => Bot.findRelativeUser(user, users));

    if (enrolledUsers.find(user => user.id === userToEnroll.id)) {
      return this.post(channelId, `${Bot.atUser(userToEnroll)}, looks like you already enrolled to the lesson`);
    } else if (lesson.users.length >= MAX_SPOTS) {
      return this.post(channelId, `${Bot.atUser(userToEnroll)}, looks like there are no free spots to this lesson`);
    }

    return this.schedule
      .addUserToLesson(userToEnroll.real_name, lesson)
      .then(() => `${Bot.atUser(userToEnroll)}, you are enrolled for ${time.format('dddd, MMMM Do, k:mm')}`)
      .then(text => this.post(channelId, text, [Bot.shortLessonDescription(lesson)]))
      .catch(() => this.post(channelId, 'failed to enroll'));
  }

  unenroll(channelId, userId, date) {
    if (!date || date.knownValues.hour === undefined) {
      return this.post(channelId, `Please, specify time`);
    }
    const userToRemove = this.getUserById(userId);

    const time = moment(date && date.date()).startOf('hour');
    const lesson = this.schedule.findLessonByDate(time);

    if (!lesson) {
      return this.post(channelId, `I can't find lesson at this time: ${time.format('dddd, MMMM Do, k:mm')}`);
    }

    const users = this.getChannelUsers();
    const enrolledName = lesson.users
      .map(name => ({ name, user: Bot.findRelativeUser(name, users) }))
      .filter(({ user }) => user.id === userToRemove.id)
      .slice(0, 1)
      .map(({ name }) => name)
      .shift();

    if (!enrolledName) {
      return this.post(channelId, `${Bot.atUser(userToRemove)}, looks like you are not enrolled to the lesson`);
    }

    return this.schedule
      .removeUserFromLesson(enrolledName, lesson)
      .then(() => `${Bot.atUser(userToRemove)}, you are released from lesson at ${time.format('dddd, MMMM Do, k:mm')}`)
      .then(text => this.post(channelId, text, [Bot.shortLessonDescription(lesson)]))
      .catch(() => this.post(channelId, 'failed to unenroll'));
  }

  post(id, text, attachments = []) {
    const messageParams = {
      attachments: attachments,
      as_user: true
    };
    return this.bot.postMessage(id, text, messageParams);
  }

  remindChannel(lesson) {
    this.log('remind:channel', this.channel.name);
    let text = 'Next lesson will be started in 45 minutes, all spots are full!';
    if (lesson.users.length < MAX_SPOTS) {
      text = 'There are empty spots the next lesson';
    }
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

    const channelUsers = this.getChannelUsers();
    lesson.users
      // .slice(0, MAX_SPOTS)
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

  getChannelUsers() {
    return this.bot.users
      .filter(user => !user.deleted && !user.is_bot && this.channel.members.includes(user.id));
  }

  getUserById(id) {
    return this.bot.users
      .find(user => user.id === id);
  }

  static atUser(user) {
    return `<@${user.id}>`;
  }

  static shortLessonDescription(lesson) {
    return {
      author_name: lesson.trainer,
      title: `${moment(lesson.start).format('k:mm')} [members ${lesson.users.length}/${MAX_SPOTS}]`,
      title_link: lesson.url,
      text: lesson.topic,
      fields: [{
        title: lesson.users.length ? 'Members' : 'No members',
        value: lesson.users.join(', ')
      }],
      footer: 'Google Sheets',
      footer_icon: 'https://www.google.com/sheets/about/favicon.ico'
    };
  }

  static findRelativeUser(searchedName, users) {
    const distance = natural.DiceCoefficient;
    const name = searchedName.toLowerCase();
    return users
      .map(user => {
        const variants = [
          user.real_name.toLowerCase(),
          user.real_name.toLowerCase().split(' ').reverse().join(' '),
          user.real_name.toLowerCase().split(' ').map(s => s.charAt(0)).join(''),
          user.real_name.toLowerCase().split(' ').map((s, i) => i === 0 ? s.charAt(0) : s).reverse().join(' '),
          user.real_name.toLowerCase().split(' ').reverse().map((s, i) => i === 0 ? s.charAt(0) : s).reverse().join(' '),
        ];

        const dist = Math.max(...variants.map(variant => distance(name, variant)));
        return { user, dist };
      })
      .sort((a, b) => b.dist - a.dist)
      .slice(0, 1)
      .map(item => item.user)
      .shift();
  }
}

module.exports = Bot;
