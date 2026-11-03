// Review fixtures for the mock Google Business Profile: a fictional San Francisco hotel.
// Shapes follow the v4 `accounts.locations.reviews` resource (starRating enum, reviewer, reviewReply).

const STAR = ['STAR_RATING_UNSPECIFIED', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

const HOTEL = {
  group: 'Harbor & Pine Hospitality',
  title: 'Harbor & Pine Hotel',
  address: 'Pine Street, Nob Hill, San Francisco, CA',
  ownerEmail: 'owner@harborandpine.example',
};

const SEED_REVIEWS = [
  { name: 'Megan Sullivan', stars: 2, days: 1, text: 'We waited almost 40 minutes at check-in on a Friday night and our room still was not ready. The front desk staff were polite but clearly overwhelmed.' },
  { name: 'David Kim', stars: 5, days: 2, text: 'Perfect location on Nob Hill with the cable car right outside. The bed was incredibly comfortable and the concierge booked us a great dinner.' },
  { name: 'Carlos Mendoza', stars: 5, days: 2, text: 'Excelente hotel. La habitación estaba muy limpia y el personal fue muy amable. Volveremos el próximo año.' },
  { name: 'Hannah Brooks', stars: 5, days: 3, text: '' },
  { name: 'Jason Wright', stars: 1, days: 3, text: 'Found stains on the sheets and the bathroom was dirty when we arrived. Housekeeping came quickly but it ruined our first night.' },
  { name: 'Emily Nguyen', stars: 5, days: 4, text: 'The rooftop view of the Bay at sunset is worth the stay on its own. Staff were friendly and check-out took two minutes.' },
  { name: 'Lucía Fernández', stars: 4, days: 5, text: 'Muy buena ubicación y el desayuno estuvo delicioso. La habitación era un poco pequeña, pero muy cómoda.' },
  { name: 'Robert Hayes', stars: 3, days: 6, text: 'Nice room, but street noise kept us up until 2am. Ask for a room at the back of the building.' },
  { name: 'Ashley Martin', stars: 4, days: 7, text: 'Clean and comfortable with a good breakfast. Valet parking at $70 a night felt expensive though.' },
  { name: 'Tyler Johnson', stars: 5, days: 8, text: 'Stayed here for a work conference. Fast Wi-Fi, a quiet room and the front desk printed my slides at midnight. Thank you!' },
  { name: 'Miguel Herrera', stars: 2, days: 9, text: 'La habitación olía a humedad y el aire acondicionado no funcionaba. Pedimos un cambio y nadie nos respondió.' },
  { name: 'Sarah Davis', stars: 2, days: 10, text: 'Charged a $45 resort fee nobody mentioned at booking, and it took two calls to get an answer about it.' },
  { name: 'Olivia Carter', stars: 5, days: 12, text: 'We celebrated our anniversary here and the staff left champagne in our room. Such a thoughtful touch.' },
  { name: 'Brandon Lee', stars: 4, days: 13, text: '' },
  { name: 'Grace Thompson', stars: 5, days: 15, text: 'Our go-to hotel every time we visit our daughter in the city. Maria at the front desk always remembers us!' },
  { name: 'Kevin Walsh', stars: 3, days: 17, text: 'Great location, but the elevator was out of service for most of our stay and our room was on the sixth floor.' },
  { name: 'Valentina Rojas', stars: 5, days: 19, text: 'Nos encantó todo. El personal de recepción fue muy atento y la vista de la ciudad es preciosa.' },
  { name: 'Rachel Foster', stars: 5, days: 21, text: 'Walking distance to Union Square and Chinatown. The bar downstairs makes a great Manhattan.' },
  { name: 'Daniel Price', stars: 1, days: 24, text: 'My reservation was cancelled without notice and I was charged twice. It took three calls to get a refund.' },
  { name: 'Natalie Scott', stars: 5, days: 27, text: 'Stylish, quiet, spotless. Ten out of ten.' },
  // Older than 30 days: lands in the Backlog and is never auto-drafted.
  { name: 'Matthew Reed', stars: 4, days: 40, text: 'Lovely hotel, a bit noisy on weekends.', reply: 'Thanks Matthew! We have since added extra soundproofing, so please try one of our back rooms next time.' },
  { name: 'Isabel Moreno', stars: 5, days: 55, text: '¡Un hotel maravilloso y muy céntrico!', reply: '¡Gracias, Isabel! Nos encantará recibirte de nuevo.' },
  { name: 'Andrew Bennett', stars: 2, days: 62, text: 'The shower barely had any hot water in the morning.' },
  { name: 'Laura Mitchell', stars: 5, days: 80, text: 'Perfect for a family trip to San Francisco.', reply: 'Thanks Laura, we hope to see you and the family again soon!' },
];

const SIMULATED_POOL = [
  { name: 'Jessica Turner', stars: 5, text: 'Just checked out after three nights. The room was spotless and the concierge was super helpful.' },
  { name: 'Patrick Murphy', stars: 1, text: 'Booked a king room and was given two twins with no apology. Not coming back.' },
  { name: 'Nicole Adams', stars: 4, text: 'Great stay and a comfortable bed. Breakfast was a little crowded on Sunday.' },
  { name: 'Ryan Cooper', stars: 5, text: '' },
  { name: 'Stephanie Ross', stars: 3, text: 'Average experience. The room was fine, but the Wi-Fi kept dropping.' },
  { name: 'Ana Gutiérrez', stars: 5, text: '¡Nos encantó el hotel! El personal fue muy amable y la ubicación es perfecta.' },
  { name: 'Javier Castillo', stars: 2, text: 'La habitación estaba sucia y tuvimos que esperar una hora para que la limpiaran.' },
  { name: 'Brian Hughes', stars: 2, text: 'The heating did not work and we were cold all night.' },
];

module.exports = { STAR, HOTEL, SEED_REVIEWS, SIMULATED_POOL };
