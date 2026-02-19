const mongoose = require('mongoose');
const ReviewSession = require('./server/models/ReviewSession');
const User = require('./server/models/User');
require('dotenv').config({ path: './server/.env' });

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/brd-review-app');
        console.log('Connected to MongoDB');

        let user = await User.findOne({ name: 'DemoUser' });
        if (!user) {
            user = await User.create({
                name: 'DemoUser',
                email: `demo${Date.now()}@example.com`,
                role: 'owner',
                country: 'Global'
            });
            console.log('Created Demo User:', user._id);
        }

        const session = await ReviewSession.create({
            title: 'International Retail Incentive Digitization BRD',
            description: 'Reviewing the digitization of retail incentives for international markets.',
            owner: user._id,
            docUrl: 'uploads/demo_brd.pdf',
            status: 'in_review',
            referenceDocs: []
        });

        console.log('Created Session:', session._id);
        console.log(`Use this ID to access the review room: http://localhost:5173/review/${session._id}`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

seed();