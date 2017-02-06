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
    return new Promise((resolve, reject) => {
      const tagger = new natural.BrillPOSTagger(lexiconPath, rulesPath, defaultCategory, error => {
        if (error) {
          this.logError();
          reject();
        } else {
          resolve(tagger);
        }
      });
    });
  }

  analize(text) {
    const words = this.tokenizer.tokenize(text);
    return this.tagger
      .then(tagger => tagger.tag(words))
      .then(Analizer.getAction)
      .catch(() => null)
      .then(action => ({
          action: action ? this.stemmer.stem(action) : null,
          date: chrono.parse(text, new Date(), { forwardDate: true })[0]
      }));
  }

  static getAction(tags) {
    let action = tags.find(Analizer.isType('W')) || tags.find(Analizer.isType('VB', true));

    if (!action) {
      const noun = tags.find(Analizer.isType('NN'));
      const preps = tags.find(Analizer.isType('IN'));
      if (noun && preps) action = noun;
    }
    if (!action) {
      action = tags.find(Analizer.isType('JJ'));
    }
    return action ? action[0] : null;
  }

  static isType(type, strict = false) {
    return (tag) => strict ? tag[1] === type : tag[1].startsWith(type);
  }
}

module.exports = Analizer;
