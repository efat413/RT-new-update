export interface Milestone {
  year: string;
  era: string;
  title: string;
  location: string;
  quote?: string;
  speaker?: string;
  description: string;
  codeSnippet?: string;
}

export const HISTORY_MILESTONES: Milestone[] = [
  {
    year: '1972',
    era: 'The Spark',
    title: 'Brian Kernighan\'s B Tutorial',
    location: 'Bell Telephone Laboratories, Murray Hill, NJ',
    quote: 'I have no idea why I picked "hello, world". There was no grand design. It was just a friendly, non-threatening word that proved the printer was functioning.',
    speaker: 'Brian Kernighan, interview 2011',
    description: 'The very first documented appearance of "hello, world" in computing history occurred in an internal Bell Labs technical report entitled "A Tutorial Introduction to the Language B", authored by Brian Kernighan for the PDP-11 minicomputer.',
    codeSnippet: `main( ) {
    extrn a, b, c;
    putchar(a); putchar(b); putchar(c); putchar('!*n');
}

a 'hell';
b 'o, w';
c 'orld';`
  },
  {
    year: '1974',
    era: 'The C Evolution',
    title: 'Programming in C: A Tutorial',
    location: 'Bell Labs Computing Science Research Center',
    description: 'Dennis Ritchie and Brian Kernighan refined the B language into C. In the 1974 internal tutorial, the phrase was streamlined into standard syntax using the printf function.',
    codeSnippet: `main() {
    printf("hello, world\\n");
}`
  },
  {
    year: '1978',
    era: 'The Universal Canon',
    title: 'The C Programming Language (K&R)',
    location: 'Prentice Hall Publishing',
    quote: 'The only way to learn a new programming language is by writing programs in it. The first program to write is the same for all languages: Print the words "hello, world". This is the big hurdle; to leap over it you have to be able to create the program text somewhere, compile it successfully, load it, run it, and find where your output went.',
    speaker: 'Brian W. Kernighan & Dennis M. Ritchie (page 5)',
    description: 'The publication of the seminal book, nicknamed "The White Book" or "K&R", enshrined "hello, world" as the canonical initiation rite for generations of software engineers across all platforms.'
  },
  {
    year: '1984',
    era: 'Personal Computing',
    title: 'Macintosh Speaks Its First Words',
    location: 'Flint Center Auditorium, Cupertino, CA',
    quote: 'Hello, I am Macintosh. It sure is great to get out of that bag... Unaccustomed as I am to public speaking, I\'d like to share with you a maxim I thought of when I first met an IBM mainframe: NEVER TRUST A COMPUTER YOU CAN\'T LIFT!',
    speaker: 'Steve Jobs & the 128K Macintosh',
    description: 'During the January 1984 launch of the Apple Macintosh, the computer utilized a built-in MacinTalk speech synthesizer to introduce itself with a variation of the greeting, dazzling the audience.'
  },
  {
    year: '1991',
    era: 'The World Wide Web',
    title: 'CERN & The First Hypertext Page',
    location: 'CERN, Geneva, Switzerland',
    description: 'Sir Tim Berners-Lee turned on info.cern.ch on his NeXT computer. The first webpage welcomed humanity to the hypertext mesh with links and explanations of how the web worked—the web\'s ultimate "Hello World".'
  },
  {
    year: '2019',
    era: 'Quantum Computing',
    title: 'Quantum Supremacy & "Hello Quantum World"',
    location: 'Google Quantum AI Lab, Santa Barbara, CA',
    description: 'The 53-qubit Sycamore quantum processor executed a quantum circuit sampling task in 200 seconds that would take the world\'s fastest classical supercomputer 10,000 years, opening the era of "Hello Quantum World".'
  }
];
