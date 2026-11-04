// A fictional business for sample data. The reviews never say what it sells, so the demo fits any business.
export const STAR = ['STAR_RATING_UNSPECIFIED', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

export const SAMPLE_BUSINESS = {
  group: 'Maple & Main Group',
  title: 'Maple & Main',
  branches: ['Downtown', 'Riverside', 'Northgate', 'Harbour', 'Old Town'],
  address: '120 Main Street, Springfield',
  ownerEmail: 'owner@mapleandmain.example',
};

export interface SeedReview {
  name: string;
  stars: number;
  days?: number;
  text?: string;
  reply?: string;
}

export const SEED_REVIEWS: SeedReview[] = [
  { name: 'Megan Sullivan', stars: 2, days: 1, text: 'We waited almost 40 minutes on a Friday and nobody told us why. The staff were polite but clearly overwhelmed.' },
  { name: 'David Kim', stars: 5, days: 2, text: 'Easy to find with parking right outside. The team went out of their way to help and I left really happy.' },
  { name: 'Carlos Mendoza', stars: 5, days: 2, text: 'Excelente servicio. El personal fue muy amable y todo estuvo muy limpio. Volveremos el próximo año.' },
  { name: 'Hannah Brooks', stars: 5, days: 3 },
  { name: 'Jason Wright', stars: 1, days: 3, text: 'The place was dirty when we arrived and it took far too long for anyone to sort it out. Really disappointing.' },
  { name: 'Emily Nguyen', stars: 5, days: 4, text: 'Great quality and worth every penny. Staff were friendly and everything took two minutes.' },
  { name: 'Lucía Fernández', stars: 4, days: 5, text: 'Muy buena ubicación y el personal fue muy atento. Un poco caro, pero vale la pena.' },
  { name: 'Robert Hayes', stars: 3, days: 6, text: 'Decent overall, but it was so noisy I could barely hear the person helping me.' },
  { name: 'Ashley Martin', stars: 4, days: 7, text: 'Clean and well run with a good team. The prices felt a little expensive though.' },
  { name: 'Tyler Johnson', stars: 5, days: 8, text: 'They fitted me in at short notice and stayed late to finish. Thank you!' },
  { name: 'Miguel Herrera', stars: 2, days: 9, text: 'Tuvimos que esperar mucho y nadie nos respondió. Pedimos ayuda dos veces.' },
  { name: 'Sarah Davis', stars: 2, days: 10, text: 'Charged a $45 fee nobody mentioned, and it took two calls to get an answer about it.' },
  { name: 'Olivia Carter', stars: 5, days: 12, text: 'We came in for an anniversary and the team added such a thoughtful touch.' },
  { name: 'Brandon Lee', stars: 4, days: 13 },
  { name: 'Grace Thompson', stars: 5, days: 15, text: 'Our go-to place every time we are in town. Maria always remembers us!' },
  { name: 'Kevin Walsh', stars: 3, days: 17, text: 'Great location, but nobody called me back when they said they would.' },
  { name: 'Valentina Rojas', stars: 5, days: 19, text: 'Nos encantó todo. El personal fue muy atento y la ubicación es perfecta.' },
  { name: 'Rachel Foster', stars: 5, days: 21, text: 'Walking distance from the station and the quality is excellent.' },
  { name: 'Daniel Price', stars: 1, days: 24, text: 'My booking was cancelled without notice and I was charged twice. It took three calls to get a refund.' },
  { name: 'Natalie Scott', stars: 5, days: 27, text: 'Friendly, quick, spotless. Ten out of ten.' },
  { name: 'Matthew Reed', stars: 4, days: 40, text: 'Lovely people, a bit busy on weekends.', reply: 'Thanks Matthew! We have added more help at weekends, so please try us again soon.' },
  { name: 'Isabel Moreno', stars: 5, days: 55, text: '¡Un lugar maravilloso y muy céntrico!', reply: '¡Gracias, Isabel! Nos encantará verte de nuevo.' },
  { name: 'Andrew Bennett', stars: 2, days: 62, text: 'The quality was poor for the price I paid.' },
  { name: 'Laura Mitchell', stars: 5, days: 80, text: 'Perfect for the whole family.', reply: 'Thanks Laura, we hope to see you and the family again soon!' },
];

export const SIMULATED_POOL: SeedReview[] = [
  { name: 'Jessica Turner', stars: 5, text: 'Just visited for the third time. Spotless, and the team was super helpful.' },
  { name: 'Patrick Murphy', stars: 1, text: 'Booked one thing and got something else with no apology. Not coming back.' },
  { name: 'Nicole Adams', stars: 4, text: 'Great experience overall. A little crowded on Sunday.' },
  { name: 'Ryan Cooper', stars: 5 },
  { name: 'Stephanie Ross', stars: 3, text: 'Average experience. Fine, but the wait was longer than promised.' },
  { name: 'Ana Gutiérrez', stars: 5, text: '¡Nos encantó! El personal fue muy amable y la ubicación es perfecta.' },
  { name: 'Javier Castillo', stars: 2, text: 'Estaba sucio y tuvimos que esperar una hora para que nos atendieran.' },
  { name: 'Brian Hughes', stars: 2, text: 'Nobody answered the phone and my question was never resolved.' },
];
