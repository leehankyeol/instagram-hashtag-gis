const async = require('async');
const request = require('request');
const write = require('write');
const timestamp = require('unix-timestamp');

const tagToInclude = 'truffle';
const tagsToExclude = ['chocolate'];
const COUNT = 10;

const apiMedia = (endCursor = null) => {
  if (endCursor) {
    return `https://www.instagram.com/explore/tags/${tagToInclude}/?__a=1&max_id=${endCursor}`;
  } else {
    return `https://www.instagram.com/explore/tags/${tagToInclude}/?__a=1`;
  }
};
const apiMedium = (shortcode) => {
  return `https://www.instagram.com/p/${shortcode}/?__a=1`;
};
const apiLocation = (id, slug) => {
  return `https://www.instagram.com/explore/locations/${id}/${slug}/?__a=1`;
};

let mediaValid = [];

let count = 0;
let maxId = null;

let content = 'Place,lat,lng,date\n';

const fetch = (maxId) => {
  if (maxId) {
    maxId = maxId.replace(/%3D/g, '=');
  }

  mediaValid = [];

  request(apiMedia(maxId), (err, res, mediaBody) => {
    try {
      mediaBody = JSON.parse(mediaBody);
    } catch (e) {
      console.log(mediaBody);
    }
    let endCursor = mediaBody.tag.media.page_info.end_cursor;
    const hasNextPage = mediaBody.tag.media.page_info.has_next_page;
    const media = mediaBody.tag.media.nodes;

    if (endCursor) {
      endCursor = endCursor.replace(/%3D/g, '=');
    }

    console.log(`Request to ${apiMedia(maxId)}...`);
    console.log(`endCursor: ${endCursor}`);

    maxId = endCursor;

    async.each(media, (medium, callback) => {
      const shortcode = medium.code;

      request(apiMedium(shortcode), (err, res, mediumBody) => {
        mediumBody = JSON.parse(mediumBody);
        const caption = mediumBody.media.caption;

        if (caption) {
          const tags = mediumBody.media.caption.match(/\#\w+/g);
          const location = mediumBody.media.location;
          let valid = true;

          for (let i = 0, length = tagsToExclude.length; i < length; i++) {
            const tagToExclude = tagsToExclude[i];
            if (!location || (!location.id || !location.slug)
            || !tags || tags.indexOf(`#${tagToExclude}`) > -1) {
              valid = false;
            }
          }
          if (valid) {
            mediaValid.push(mediumBody);
          }
        }
        callback();
      });
    }, (err) => {
      if (err) {
        console.log(err);
        return;
      }
      console.log(`${mediaValid.length} media have valid tags and location.`);
      console.log(`Total: ${count + mediaValid.length}`);

      async.each(mediaValid, (mediumValid, locationCallback) => {
        const id = mediumValid.media.location.id;
        const slug = mediumValid.media.location.slug;

        request(apiLocation(id, slug), (err, res, locationBody) => {
          locationBody = JSON.parse(locationBody);

          const date = timestamp.toDate(mediumValid.media.date);

          content += `"${locationBody.location.name}",${locationBody.location.lat},${locationBody.location.lng},${date.getFullYear()}-${(date.getMonth() + 1) < 10? '0' + (date.getMonth() + 1): date.getMonth() + 1}-${date.getDate()}\n`;
          locationCallback();
        });
      }, (locationErr) => {
        if (locationErr) {
          console.log(locationErr);
          return;
        }

        count += mediaValid.length;

        if (count < COUNT) {
          fetch(maxId);
        } else {
          console.log(`Count: ${count}`);
          write('result.csv', content, function(err) {
            if (err) console.log(err);
          });
        }
      });
    });
  });
}

fetch(maxId);
