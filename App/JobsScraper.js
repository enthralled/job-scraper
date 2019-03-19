if (inIframe()) {

    $(function() {

        var frame_id = Date.now();
        var windowLocation = window.location.href;

        var capturedLinks = {};
        var KEYS = [];

        function sendLinkData(text, href) {
            var linkData = {
                text: text,
                href: href ? rel_to_abs(href) : href
            };

            if (linkData.href) {
                if ((linkData.href in capturedLinks)) {
                    return;
                }
                capturedLinks[linkData.href] = true;
            }

            window.top.postMessage({
                m80ContentFrame: linkData,
                keys: 0
            }, '*');
        }

        var linkedInJobParser = function(frame_id) {
            this.frame_id = frame_id;
            console.log(this.frame_id + "-> Initializing Job Parser")
            this.jobs = [];
            this.jobMap = {};
            this.LINKEDIN_JOBS_URL = 'www.linkedin.com/jobs'
            this.MAX_RETRIES = 4;
            this.currentRetriesCount = 0;
            this.previousJobCount = 0;

            // this retry logic is distinct. if we match an iFrame inside an iFrame with the Linked iN Domain, it could
            // be an add... if we don't exit after X tries, the extension will get stuck.
            this.MAX_FEED_RETRIES = 4;
            this.feed_retries = 0;

            this.start = function start() {
                console.log(this.frame_id + "-> Start Job Parser called")
                if (this.isLinkedInPage(windowLocation)) {
                    console.log(this.frame_id + "-> IsLinkedIn? true ->" + windowLocation)
                    this.parseLinkedIn();
                } else {
                    console.log(this.frame_id + "-> IsLinkedIn? false ->" + windowLocation)
                }
            };

            this.isLinkedInPage = function(page) {
                var linkedInRegex = /https:\/\/(www.)?linkedin\.com/;
                return page.match(linkedInRegex) ? true : false
            }

            this.getJobs = function() {
                var $feed = $('.jobs-search-results__list').children();

                if ($feed.length !== 0) {
                    console.log(this.frame_id + "--> Found Jobs Feed");
                    return $feed;
                }

                console.log(this.frame_id + "--> Could not find jobs feed");
                return [];
            }

            this.parseLinkedIn = function parseLinkedIn() {

                console.log(this.frame_id + "--> Parsing Links");

                if (this.feed_retries <= this.MAX_RETRIES) {
                    var $jobElements = this.getJobs();
                    if ($jobElements.length == 0) {
                        console.log(this.frame_id + "Job list = 0; Will Retry");
                        this.feed_retries++;
                        var that = this;
                        setTimeout(function() {
                            var callback = that.parseLinkedIn.bind(that)
                            window.requestAnimationFrame(callback)
                        }, 1000);
                    } else {
                        console.log(this.frame_id + "Jobs length = " + $jobElements.length);
                        this.getJobTitleAndLink();
                    }
                }
            }

            this.getJobTitleAndLink = function() {

                console.log('Attempting to get rendered jobs');
                var self = this;
                var finishedParsingLinks = false;

                var $jobElements = this.getJobs();

                if ($jobElements === this.previousJobCount) {
                    console.log(this.frame_id + '--> # jobs same as last pass, retry');
                    this.currentRetriesCount += 1;
                } else {
                    console.log(this.frame_id + '--> New jobs found');
                    this.currentRetriesCount = 0;
                }

                this.previousJobCount = $jobElements.length;

                var $jobLinkTags = $jobElements.find('.job-card-search__link-wrapper.js-focusable-card.ember-view').filter(':odd');
                console.log('Job link length = ' + $jobLinkTags.length);

                if (this.currentRetriesCount <= this.MAX_RETRIES) {
                    if ($jobElements.length !== $jobLinkTags.length) {
                        this.currentRetriesCount++;
                        $('html, body').animate({
                            scrollTop: document.body.scrollHeight
                        }, 2000, 'linear');
                        $('html, body').animate({
                            scrollTop: -document.body.scrollHeight
                        }, 2000, 'linear', self.parseLinkedIn.bind(self));
                        return;
                    }
                }

                if ($jobLinkTags) {
                    $jobLinkTags.each(function() {
                        var $this = $(this);
                        var jobLink = $this.attr('href');
                        var jobTitle = $this.text().trim();
                        var jobID = $this.attr('id');
                        if (!self.jobMap[jobID]) {
                            self.jobs.push({
                                jobTitle: jobTitle,
                                jobLink: jobLink,
                                jobID: jobID,
                            })
                            self.jobMap[jobID] = true;
                            finishedParsingLinks = false;
                        } else {
                            finishedParsingLinks = true;
                        }
                    });
                }

                //console.log(this.frame_id + "-> scrolling to " + document.body.scrollHeight);
                console.log(this.frame_id + "-> Finished Parsing Page? " + finishedParsingLinks);
                self.getLocationOrParse(finishedParsingLinks);
            };

            this.getNextButton = function() {
                var $nextButton;

                if (this.jobs.length > 0) {
                    try {
                        $nextButton = $('.artdeco-pagination__button--next');
                        console.log("Found 'Next' Button")
                    } catch (e) {
                        return false;
                    }
                } else {
                    console.log('Jobs not logged -- staying on page')
                    return;
                }

                if ($nextButton.attr('disabled')) {
                    return false;
                } else {
                    return $nextButton;
                }
            }

            this.goToNextPage = function() {
                var $nextButton = this.getNextButton();

                if ($nextButton) {
                    console.log('Going to next page')
                    $nextButton.click();
                    $(function() {
                        var linkedIn = new linkedInJobParser(frame_id);
                        linkedIn.start();
                    });

                } else {
                    console.log("No next button");
                    return false;
                }
            }


            this.getLocationOrParse = function getLocationOrParse(finishedParsingLinks) {
                if ((this.jobs.length > 0) && (finishedParsingLinks || this.currentRetriesCount > this.MAX_RETRIES)) {
                    this.getLocations(0, 0);
                } else if (this.currentRetriesCount <= this.MAX_RETRIES) {
                    setTimeout(this.getJobTitleAndLink.bind(this), 2000);
                }
            };

            this.getLocations = function(index, retry) {
                console.log('getLocation ' + index + ' ' + retry);

                if (index >= this.jobs.length) {
                    if (this.getNextButton()) {
                        this.sendJobs();
                        this.goToNextPage();
                        return;
                    } else {
                        this.sendJobs();
                        return;
                    }
                }

                var $jobLocations = $('.job-card-search__location');
                if ($jobLocations.length <= 0) {
                    console.log('No Locations');
                } else {
                    console.log('Found Locations');
                }

                if ($jobLocations) {
                    var $location = $jobLocations[index].textContent.trim();
                    if ($location) {
                        var job = this.jobs[index];
                        job.jobLocation = $location;
                    }
                    this.getLocations(++index, 0);
                } else if (retry < 3) {
                    console.log('retry finding location ' + index);
                    this.getLocations(index, ++retry);
                } else {
                    console.log('skipping location ' + index);
                    this.getLocations(++index, 0);
                }
            };

            this.sendJobs = function sendJobs() {
                for (var i = 0; i < this.jobs.length; i++) {
                    var job = this.jobs[i];
                    console.log("sending " + i + " " + job.jobLink);
                    var consolidatedTitle = job.jobTitle + ": " + job.jobLocation;
                    sendLinkData(consolidatedTitle, job.jobLink);
                }
            };
        };

        var linkedIn = new linkedInJobParser(frame_id);
        linkedIn.start();

    });

} else {
    $(function() {
        var iframe;
        try {
            iframe = document.getElementsByClassName("theiframe")[0].contentWindow;
        } catch (e) {}

        if (iframe) {
            function doSomethingWithSelectedText() {
                var selectedText = window.getSelection().toString();
                if (selectedText) {
                    iframe.postMessage({
                        m80ContentFrame: selectedText
                    }, '*');
                }
            }
            document.onmouseup = doSomethingWithSelectedText;
            document.onkeyup = doSomethingWithSelectedText;
        }
    });
}

function fullPath(el) {
    if (!(el instanceof Element))
        return;
    var path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        var selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            var sib = el,
                nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector)
                    nth++;
            }
            if (nth != 1)
                selector += ":nth-of-type(" + nth + ")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

function inIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rel_to_abs(url) {
    /* Only accept commonly trusted protocols:
     * Only data-image URLs are accepted, Exotic flavours (escaped slash,
     * html-entitied characters) are not supported to keep the function fast */
    if (/^(https?|file|ftps?|mailto|javascript|data:image\/[^;]{2,9};):/i.test(url))
        return url;
    //Url is already absolute

    var base_url = location.href.match(/^(.+)\/?(?:#.+)?$/)[0] + "/";
    if (url.substring(0, 2) == "//")
        return location.protocol + url;
    else if (url.charAt(0) == "/")
        return location.protocol + "//" + location.host + url;
    else if (url.substring(0, 2) == "./")
        url = "." + url;
    else if (/^\s*$/.test(url))
        return "";
    //Empty = Return nothing
    else
        url = "../" + url;

    url = base_url + url;
    var i = 0;
    while (/\/\.\.\//.test(url = url.replace(/[^\/]+\/+\.\.\//g, "")))
    ;

    /* Escape certain characters to prevent XSS */
    url = url.replace(/\.$/, "").replace(/\/\./g, "").replace(/"/g, "%22").replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E");
    return encodeURI(url);
}