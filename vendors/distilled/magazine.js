var _ = require('../../lib/underscore');

var path = require('path');
var fs = require('fs');
var sys = require('sys');

var logger = require('../../lib/log').logger;

var parser   = require('../htmlparser/lib/htmlparser'),
    jsdom    = require('../jsdom/lib/jsdom');

var columns = {
    itn: '新闻',
    dyk: '新知',
    otd: '历史上的今天',
    feature: '特色',
    good: '优良',
    featurepic: '图片'
};

var tocTmpl = _.template(
              '<% if (items.length > 0) { %>' +
              '<div id="toc-<%= column %>"><%= name %></div>' +
              '<ul>' +
              '<% for (var i = 0;i < items.length; i++) { %>' +
              '<li id="toc-<%= pageId(items[i]) %>">' +
              '<%= items[i] %>' +
              '</li>' +
              '<% } %>' +
              '</ul>' +
              '<% } %>'
              );

function pageId(title) {
    if (title) {
        return 'article-' + title.replace(/[ :\(\)·]/g, '_');
    } else {
        return '';
    }
}

var uploadpattern =
  /^(http:\/\/upload\.wikimedia\.org)(\/wikipedia\/\w+)(\/thumb)(\/\w+)(\/\w+\/)([^#?\s]+)$/;

function filename(src) {
    var result = uploadpattern.exec(decodeURIComponent(src));
    if (!result) {
        return "";
    } else {
        var filepath = result[result.length - 1].split("/");
        return filepath[0].replace('_', ' ');
    }
}

function renderToc(toc) {
    var html = '';
    _(toc).chain().keys().each(function (column) {
        var name = columns[column],
        items = _([toc[column]]).flatten();
        html += tocTmpl({
          name: name, column: column, items: items, pageId: pageId
        });
    });
    return html;
}

function Magazine(index, html, cbReady) {
    this.index = index;
    this.toc = {};
    html = '<html><head></head><body>' + html + '</body></html>';
    this.document = jsdom.jsdom(html, undefined, {parser: parser});
    this.window   = this.document.createWindow();
    jsdom.jQueryify(this.window, "../../lib/jquery.js", cbReady);
}

Magazine.prototype.coverphoto = function (photo) {
    this.window.$('.cover-w').html('<img data="' + photo + '"/>');
};

Magazine.prototype.fixArticle = function (title) {
    var self = this, id = pageId(title);
    this.window.$('#' + id + ' .toc').remove();
    this.window.$('#' + id + ' .editsection').remove();
    this.window.$('#' + id + ' .metadata').remove();
    this.window.$('#' + id + ' .navbox').remove();
    this.window.$('#' + id + ' .infobox').remove();
    this.window.$('#' + id + ' .topicon').remove();
    this.window.$('#' + id + ' table:first-child[class="wikitable"]').remove();

    this.window.$('#' + id + ' .thumb').removeClass('tright').removeClass('tleft');

    this.window.$('#' + id + ' a').each(function (i, a) {
        a = self.window.$(a);
        var href = a.attr('href');
        href = 'http://zh.wikipedia.org' + href;
        a.attr('href', href);
        a.attr('target', 'blank');
    });

    this.window.$('#' + id + ' img').each(function (i, img) {
        img = self.window.$(img);
        img.attr('data', filename(img.attr('src')));
        img.attr('src', '');
    });
};

Magazine.prototype.addArticle = function (title, content) {
    this.window.$('#articles').append(
        this.window.$('<div id=' + pageId(title) + ' class="pages">' + content + '</div>')
    );
    this.fixArticle(title);
};

Magazine.prototype.mkCover = function (articles) {
    var feature = this.index.feature;
    if(_(articles).indexOf(feature) !== -1) {
        this.window.$('.cover-x ul').append(this.window.$('<li>' + feature + '</li>'));
    }
    var good = this.index.good;
    if(_(articles).indexOf(good) !== -1) {
        this.window.$('.cover-x ul').append(this.window.$('<li>' + good + '</li>'));
    }
    var featurepic = this.index.featurepic;
    if(_(articles).indexOf(featurepic) !== -1) {
        this.window.$('.cover-x ul').append(this.window.$('<li>' + featurepic + '</li>'));
    }

    var itn = this.index.itn;
    _(itn).chain().select(function (article) {
        return _(articles).indexOf(article) !== -1;
    }).each(function (n) {
        this.window.$('.cover-z ul').append(this.window.$('<li>' + n + '</li>'));
    }, this);

    var dyk = this.index.dyk;
    _(dyk).chain().select(function (article) {
        return _(articles).indexOf(article) !== -1;
    }).each(function (k) {
        this.window.$('.cover-y ul').append(this.window.$('<li>' + k + '</li>'));
    }, this);
};

Magazine.prototype.mkToc = function (toc, articles) {
    var self = this;
    _(toc).each(function (item) {
        logger.info('adding toc:' + item);
        var titles = self.index[item];
        if(_.isArray(titles)) {
            _.each(titles, function (title) {
                if (self.toc[item] === undefined) {
                    self.toc[item] = [];
                }
                if(_(articles).indexOf(title) !== -1) {
                    self.toc[item].push(title);
                }
            });
        } else {
            if(_(articles).indexOf(titles) !== -1) {
                self.toc[item] = titles;
            }
        }

        self.window.$('#tocpage').html(renderToc(self.toc));
    });
};

Magazine.prototype.mkContents = function (toc, articles) {
    _(toc).chain().map(function (item) {
        return this.index[item];
    }, this).flatten().unique().select(function (article) {
        return _(articles).indexOf(article) !== -1;
    }).each(function (title) {
        logger.info('move article:' + title);
        var id = pageId(title);
        if (title && id) {
            this.window.$('#contents').append(this.window.$('#' + id));
            this.window.$('#' + id).prepend(this.window.$('<h1>' + title + '</h1>'));
        }
    }, this);
};

Magazine.prototype.makeup = function (option, articles) {
    this.mkCover(articles);
    this.mkToc(option.toc, articles);
    this.mkContents(option.toc, articles);
};

Magazine.prototype.html = function () {
    return this.window.$('#contents').html();
};

exports.create = function (index, html, cbReady) {
    return new Magazine(index, html, cbReady);
};

