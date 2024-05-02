/*
 * Copyright 2018 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

(function($) {

    'use strict';

    $(function() {
        $('[data-toggle="tooltip"]').tooltip();
        $('[data-toggle="popover"]').popover();

        $('.popover-dismiss').popover({
            trigger: 'focus'
        })
    });


    function bottomPos(element) {
        return element.offset().top + element.outerHeight();
    }

    // Bootstrap Fixed Header
    $(function() {
        var promo = $(".js-td-cover");
        if (!promo.length) {
            return
        }

        var promoOffset = bottomPos(promo);
        var navbarOffset = $('.js-navbar-scroll').offset().top;

        var threshold = Math.ceil($('.js-navbar-scroll').outerHeight());
        if ((promoOffset - navbarOffset) < threshold) {
            $('.js-navbar-scroll').addClass('navbar-bg-onscroll');
        }


        $(window).on('scroll', function() {
            var navtop = $('.js-navbar-scroll').offset().top - $(window).scrollTop();
            var promoOffset = bottomPos($('.js-td-cover'));
            var navbarOffset = $('.js-navbar-scroll').offset().top;
            if ((promoOffset - navbarOffset) < threshold) {
                $('.js-navbar-scroll').addClass('navbar-bg-onscroll');
            } else {
                $('.js-navbar-scroll').removeClass('navbar-bg-onscroll');
                $('.js-navbar-scroll').addClass('navbar-bg-onscroll--fade');
            }
        });
    });


}(jQuery));

;
/*
 * Copyright 2018 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

(function ($) {
    'use strict';

    // Headers' anchor link that shows on hover
    $(function () {
        // append anchor links to headings in markdown.
        var article = document.getElementsByTagName('main')[0];
        if (!article) {
            return;
        }
        var headings = article.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(function (heading) {
            if (heading.id) {
                var a = document.createElement('a');
                // set visibility: hidden, not display: none to avoid layout change
                a.style.visibility = 'hidden';
                // [a11y] hide this from screen readers, etc..
                a.setAttribute('aria-hidden', 'true');
                // material insert_link icon in svg format
                a.innerHTML = ' <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
                a.href = '#' + heading.id;
                heading.insertAdjacentElement('beforeend', a);
                heading.addEventListener('mouseenter', function () {
                    a.style.visibility = 'initial';
                });
                heading.addEventListener('mouseleave', function () {
                    a.style.visibility = 'hidden';
                });
            }
        });
    });

}(jQuery));

;
// Adapted from code by Matt Walters https://www.mattwalters.net/posts/2018-03-28-hugo-and-lunr/

(function ($) {
    'use strict';

    $(document).ready(function () {
        const $searchInput = $('.td-search-input');

        //
        // Options for popover
        //

        $searchInput.data('html', true);
        $searchInput.data('placement', 'bottom');
        $searchInput.data(
            'template',
            '<div class="popover offline-search-result" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
        );

        //
        // Register handler
        //

        $searchInput.on('change', (event) => {
            render($(event.target));

            // Hide keyboard on mobile browser
            $searchInput.blur();
        });

        // Prevent reloading page by enter key on sidebar search.
        $searchInput.closest('form').on('submit', () => {
            return false;
        });

        //
        // Lunr
        //

        let idx = null; // Lunr index
        const resultDetails = new Map(); // Will hold the data for the search results (titles and summaries)

        // Set up for an Ajax call to request the JSON data file that is created by Hugo's build process
        $.ajax($searchInput.data('offline-search-index-json-src')).then(
            (data) => {
                idx = lunr(function () {
                    this.ref('ref');

                    // If you added more searchable fields to the search index, list them here.
                    // Here you can specify searchable fields to the search index - e.g. individual toxonomies for you project
                    // With "boost" you can add weighting for specific (default weighting without boost: 1)
                    this.field('title', { boost: 5 });
                    this.field('categories', { boost: 3 });
                    this.field('tags', { boost: 3 });
                    // this.field('projects', { boost: 3 }); // example for an individual toxonomy called projects
                    this.field('description', { boost: 2 });
                    this.field('body');

                    data.forEach((doc) => {
                        this.add(doc);

                        resultDetails.set(doc.ref, {
                            title: doc.title,
                            excerpt: doc.excerpt,
                        });
                    });
                });

                $searchInput.trigger('change');
            }
        );

        const render = ($targetSearchInput) => {
            // Dispose the previous result
            $targetSearchInput.popover('dispose');

            //
            // Search
            //

            if (idx === null) {
                return;
            }

            const searchQuery = $targetSearchInput.val();
            if (searchQuery === '') {
                return;
            }

            const results = idx
                .query((q) => {
                    const tokens = lunr.tokenizer(searchQuery.toLowerCase());
                    tokens.forEach((token) => {
                        const queryString = token.toString();
                        q.term(queryString, {
                            boost: 100,
                        });
                        q.term(queryString, {
                            wildcard:
                                lunr.Query.wildcard.LEADING |
                                lunr.Query.wildcard.TRAILING,
                            boost: 10,
                        });
                        q.term(queryString, {
                            editDistance: 2,
                        });
                    });
                })
                .slice(
                    0,
                    $targetSearchInput.data('offline-search-max-results')
                );

            //
            // Make result html
            //

            const $html = $('<div>');

            $html.append(
                $('<div>')
                    .css({
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '1em',
                    })
                    .append(
                        $('<span>')
                            .text('Search results')
                            .css({ fontWeight: 'bold' })
                    )
                    .append(
                        $('<i>')
                            .addClass('fas fa-times search-result-close-button')
                            .css({
                                cursor: 'pointer',
                            })
                    )
            );

            const $searchResultBody = $('<div>').css({
                maxHeight: `calc(100vh - ${
                    $targetSearchInput.offset().top -
                    $(window).scrollTop() +
                    180
                }px)`,
                overflowY: 'auto',
            });
            $html.append($searchResultBody);

            if (results.length === 0) {
                $searchResultBody.append(
                    $('<p>').text(`No results found for query "${searchQuery}"`)
                );
            } else {
                results.forEach((r) => {
                    const doc = resultDetails.get(r.ref);
                    const href =
                        $searchInput.data('offline-search-base-href') +
                        r.ref.replace(/^\//, '');

                    const $entry = $('<div>').addClass('mt-4');

                    $entry.append(
                        $('<small>').addClass('d-block text-muted').text(r.ref)
                    );

                    $entry.append(
                        $('<a>')
                            .addClass('d-block')
                            .css({
                                fontSize: '1.2rem',
                            })
                            .attr('href', href)
                            .text(doc.title)
                    );

                    $entry.append($('<p>').text(doc.excerpt));

                    $searchResultBody.append($entry);
                });
            }

            $targetSearchInput.on('shown.bs.popover', () => {
                $('.search-result-close-button').on('click', () => {
                    $targetSearchInput.val('');
                    $targetSearchInput.trigger('change');
                });
            });

            // Enable inline styles in popover.
            const whiteList = $.fn.tooltip.Constructor.Default.whiteList;
            whiteList['*'].push('style');

            $targetSearchInput
                .data('content', $html[0].outerHTML)
                .popover({ whiteList: whiteList })
                .popover('show');
        };
    });
})(jQuery);

;


;


;


;


(function () {
  var shade;
  var iframe;

  var insertFrame = function () {
    shade = document.createElement('div');
    shade.classList.add('drawioframe');
    iframe = document.createElement('iframe');
    shade.appendChild(iframe);
    document.body.appendChild(shade);
  }

  var closeFrame = function () {
    if (shade) {
      document.body.removeChild(shade);
      shade = undefined;
      iframe = undefined;
    }
  }

  var imghandler = function (img, imgdata) {
    var url = "https://embed.diagrams.net/";
    url += '?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&saveAndEdit=1&noSaveBtn=1';

    var wrapper = document.createElement('div');
    wrapper.classList.add('drawio');
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    var btn = document.createElement('button');
    btn.classList.add('drawiobtn');
    btn.insertAdjacentHTML('beforeend', '<i class="fas fa-edit"></i>');
    wrapper.appendChild(btn);

    btn.addEventListener('click', function (evt) {
      if (iframe) return;
      insertFrame();
      var handler = function (evt) {
        var wind = iframe.contentWindow;
        if (evt.data.length > 0 && evt.source == wind) {
          var msg = JSON.parse(evt.data);

          if (msg.event == 'init') {
            wind.postMessage(JSON.stringify({action: 'load', xml: imgdata}), '*');

          } else if (msg.event == 'save') {
            var fmt = imgdata.indexOf('data:image/png') == 0 ? 'xmlpng' : 'xmlsvg';
            wind.postMessage(JSON.stringify({action: 'export', format: fmt}), '*');

          } else if (msg.event == 'export') {
            const fn = img.src.replace(/^.*?([^/]+)$/, '$1');
            const dl = document.createElement('a');
            dl.setAttribute('href', msg.data);
            dl.setAttribute('download', fn);
            document.body.appendChild(dl);
            dl.click();
            dl.parentNode.removeChild(dl);
          }

          if (msg.event == 'exit' || msg.event == 'export') {
            window.removeEventListener('message', handler);
            closeFrame();
          }
        }
      };

      window.addEventListener('message', handler);
      iframe.setAttribute('src', url);
    });
  };


document.addEventListener('DOMContentLoaded', function () {
  // find all the png and svg images that may have embedded xml diagrams
  for (const el of document.getElementsByTagName('img')) {
    const img = el;
    const src = img.getAttribute('src');
    if (!src.endsWith('.svg') && !src.endsWith('.png')) {
      continue;
    }

    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.open("GET", src);
    xhr.addEventListener("load", function () {
      const fr = new FileReader();
      fr.addEventListener('load', function () {
        if (fr.result.indexOf('mxfile') != -1) {
          const fr = new FileReader();
          fr.addEventListener('load', function () {
            const imgdata = fr.result;
            imghandler(img, imgdata);
          });
          fr.readAsDataURL(xhr.response);
        }
      });
      fr.readAsBinaryString(xhr.response);
    });
    xhr.send();
  };
});
}());


