const functions = require('firebase-functions');
const fetch = require('node-fetch');

exports.triggerGameDayUpdate = functions.https.onRequest(async (req, res) => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/randyj18/fantasy_hockey/actions/workflows/game_day_update.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${functions.config().github.token}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({ ref: 'master' })  // or 'master' if that's your default branch
      }
    );
    if (!response.ok) throw new Error(await response.text());
    res.status(200).send('Workflow dispatched');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.toString());
  }
});
