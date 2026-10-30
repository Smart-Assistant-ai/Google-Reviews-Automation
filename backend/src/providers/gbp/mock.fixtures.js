// Review fixtures for the mock Google Business Profile. Shapes follow the v4
// `accounts.locations.reviews` resource (starRating enum, reviewer, reviewReply).

const STAR = ['STAR_RATING_UNSPECIFIED', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

const SEED_REVIEWS = [
  { name: 'Priya Sharma', stars: 2, days: 1, text: 'Waited almost 40 minutes for a margherita and it arrived lukewarm. Staff were polite but clearly overwhelmed on a Friday night.' },
  { name: 'Rahul Kulkarni', stars: 5, days: 2, text: 'Best wood-fired crust in Pune, hands down. The burrata pizza is unreal. Will be back next weekend!' },
  { name: 'Ananya Iyer', stars: 4, days: 2, text: 'Lovely ambience and great pasta. Slightly pricey but worth it for a date night.' },
  { name: 'Vikram Desai', stars: 5, days: 3, text: '' },
  { name: 'Sneha Patil', stars: 1, days: 3, text: 'Found a hair in my pizza. Manager offered to remake it but honestly lost my appetite. Very disappointing.' },
  { name: 'Arjun Mehta', stars: 5, days: 4, text: 'The tiramisu alone is worth the trip. Service was quick and friendly.' },
  { name: 'अमित वर्मा', stars: 5, days: 5, text: 'बहुत ही स्वादिष्ट पिज़्ज़ा! स्टाफ़ बहुत अच्छा था। परिवार के साथ ज़रूर आएँ।' },
  { name: 'Kavya Reddy', stars: 3, days: 6, text: 'Pizza was good but the music was way too loud to have a conversation.' },
  { name: 'Rohan Joshi', stars: 4, days: 7, text: 'Solid pizza, good beer selection. Parking is a nightmare though.' },
  { name: 'Meera Nair', stars: 5, days: 8, text: 'Ordered for a birthday party of 15 — everything arrived hot and on time. Thank you team!' },
  { name: 'Lucía Fernández', stars: 5, days: 9, text: 'La mejor pizza que he probado en India. ¡El personal fue muy amable!' },
  { name: 'Siddharth Rao', stars: 2, days: 10, text: 'Delivery took 75 minutes and the driver could not find the address despite clear directions.' },
  { name: 'Ishita Ghosh', stars: 5, days: 12, text: 'Vegan options are actually good here, not an afterthought. The vegan pepperoni is brilliant.' },
  { name: 'Karan Malhotra', stars: 4, days: 13, text: '' },
  { name: 'Pooja Bhatt', stars: 5, days: 15, text: 'Our go-to place every Sunday. Chef Joe remembers our order!' },
  { name: 'Nikhil Sawant', stars: 3, days: 17, text: 'Food is great, but the AC was not working and it got really hot inside.' },
  { name: 'सचिन गायकवाड', stars: 4, days: 19, text: 'पिझ्झा छान होता, पण थोडा वेळ लागला. तरीही पुन्हा येऊ.' },
  { name: 'Divya Menon', stars: 5, days: 21, text: 'Garlic knots are addictive. Staff recommended a great wine pairing.' },
  { name: 'Aditya Kapoor', stars: 1, days: 24, text: 'Was charged twice on my card and it took three calls to get it refunded.' },
  { name: 'Tanvi Shah', stars: 5, days: 27, text: 'Cozy, fast, delicious. Ten out of ten.' },
  // Older than 30 days: lands in the Backlog, never auto-drafted or auto-posted.
  { name: 'Manish Gupta', stars: 4, days: 40, text: 'Good food, a bit noisy on weekends.', reply: 'Thanks Manish! We are working on the acoustics — come try a weekday lunch.' },
  { name: 'Ritu Singh', stars: 5, days: 55, text: 'Amazing calzone!', reply: 'Thank you Ritu, the calzone team is thrilled!' },
  { name: 'Harsh Vora', stars: 2, days: 62, text: 'Pizza base was burnt on one side.' },
  { name: 'Neha Pillai', stars: 5, days: 80, text: 'Perfect for family dinners.', reply: 'Thanks Neha — see you and the family soon!' },
];

const SECOND_LOCATION_REVIEWS = [
  { name: 'Gaurav Jain', stars: 4, days: 2, text: 'Quick lunch combo, good value.' },
  { name: 'Shruti Kale', stars: 5, days: 5, text: 'Express outlet but the same great taste.' },
  { name: 'Yash Thakur', stars: 2, days: 9, text: 'Order was missing the garlic bread I paid for.' },
  { name: 'Aparna Das', stars: 5, days: 14, text: '' },
];

const SIMULATED_POOL = [
  { name: 'Farhan Qureshi', stars: 5, text: 'Just had the truffle mushroom pizza — incredible. Staff were super attentive.' },
  { name: 'Ayesha Khan', stars: 1, text: 'Booked a table for 8pm, were seated at 8:45 with no apology. Not coming back.' },
  { name: 'Devendra Pawar', stars: 4, text: 'Good pizza, slightly salty this time. Still a favourite.' },
  { name: 'Riya Banerjee', stars: 5, text: '' },
  { name: 'Omkar Shinde', stars: 3, text: 'Average experience. Pizza was fine, dessert was stale.' },
  { name: 'Zara Thomas', stars: 5, text: 'Celebrated our anniversary here, they surprised us with a dessert. So sweet!' },
  { name: 'प्रिया देशमुख', stars: 5, text: 'खूप छान अनुभव! पिझ्झा अप्रतिम होता.' },
  { name: 'Kunal Bose', stars: 2, text: 'Cold fries and the pizza was undercooked in the middle.' },
];

module.exports = { STAR, SEED_REVIEWS, SECOND_LOCATION_REVIEWS, SIMULATED_POOL };
