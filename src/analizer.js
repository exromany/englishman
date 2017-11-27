const path = require('path');
const natural = require('natural');
const chrono = require('chrono-node');

const logger = require('./logger');

const basePath = path.resolve(require.resolve('natural'), '../brill_pos_tagger/data/English');
const rulesPath = path.resolve(basePath, 'tr_from_posjs.txt');
const lexiconPath = path.resolve(basePath, 'lexicon_from_posjs.json');
const defaultCategory = 'N';

class Analizer {
  constructor() {
    this.log = logger.bind(logger, 'BOT');
    this.logError = (error) => this.log('error', error);

    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.tagger = this.initTagger();
  }

  initTagger() {
    const lexicon = new natural.Lexicon(lexiconPath, defaultCategory);
    const ruleSet = new natural.RuleSet(rulesPath);
    return new natural.BrillPOSTagger(lexicon, ruleSet);
  }

  analize(text) {
    const words = this.tokenizer.tokenize(text);
    const date = chrono.parse(text, new Date(), { forwardDate: true })[0];
    return Promise.resolve(this.tagger.tag(words))
      .then(Analizer.getAction)
      .then(action => action ? this.stemmer.stem(action) : null)
      .then(Analizer.classifyAction)
      .catch(() => null)
      .then(action => ({ action, date }));
  }

  static getAction(tags) {
    let action = tags.find(Analizer.isType('W')) || tags.find(Analizer.isType('VB'));

    if (!action) {
      const noun = tags.find(Analizer.isType('NN'));
      const preps = tags.find(Analizer.isType('IN'));
      if (noun && preps) action = noun;
    }
    if (!action) {
      action = tags.find(Analizer.isType('JJ'));
    }
    if (!action) {
      action = tags.find(Analizer.isType('N'));
    }
    if (!action) {
      action = tags.find(Analizer.isType('UH'));
    }
    return action ? action[0] : null;
  }

  static isType(type, strict = false) {
    return (tag) => strict ? tag[1] === type : tag[1].startsWith(type);
  }

  static classifyAction(action) {
    switch (action) {
      case 'add':
      case 'sign':
      case 'enrol':
      case 'signup':
      case 'regist':
      case 'subscrib':
        return Analizer.ENROLL_ACTION;
      case 'remov':
      case 'delet':
      case 'releas':
      case 'signout':
      case 'unenrol':
      case 'unregist':
      case 'unsubscrib':
        return Analizer.UNENROLL_ACTION;
      case 'hi':
      case 'ping':
      case 'hello':
      case 'start':
      case 'check':
      case 'welcom':
        return Analizer.HELLO_ACTION;
      case 'tell':
      case 'show':
      case 'timet':
      case 'lesson':
      case 'scedul':
      case 'shedul':
      case 'schedul':
        return Analizer.SCHEDULE_ACTION;
      case 'help':
      case 'what':
        return Analizer.HELP_ACTION;
      case 'link':
      case 'page':
      case 'souce':
        return Analizer.LINK_ACTION;
      default:
        return null;
    }
  }

}

Analizer.ENROLL_ACTION = 'enroll';
Analizer.UNENROLL_ACTION = 'unenroll';
Analizer.HELLO_ACTION = 'hello';
Analizer.HELP_ACTION = 'help';
Analizer.LINK_ACTION = 'link';
Analizer.SCHEDULE_ACTION = 'schedule';

module.exports = Analizer;
