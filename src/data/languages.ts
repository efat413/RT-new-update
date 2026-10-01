export interface CodeLanguage {
  id: string;
  name: string;
  extension: string;
  category: 'interpreted' | 'compiled' | 'systems' | 'scripting' | 'markup';
  year: number;
  creator: string;
  code: string;
  expectedOutput: string;
  compilerName: string;
  compileTimeMs: number;
  trivia: string;
}

export interface WorldLanguage {
  id: string;
  language: string;
  nativeName: string;
  greeting: string;
  transliteration?: string;
  region: 'Europe' | 'Americas' | 'Asia-Pacific' | 'Middle East & Africa' | 'Constructed & Classical';
  speechCode: string;
  speakersCount: string;
  culturalNote: string;
}

export interface TimelineMilestone {
  year: string;
  title: string;
  author: string;
  context: string;
  snippet: string;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  {
    id: 'python',
    name: 'Python',
    extension: '.py',
    category: 'interpreted',
    year: 1991,
    creator: 'Guido van Rossum',
    code: `print("Hello, World!")`,
    expectedOutput: `Hello, World!`,
    compilerName: 'CPython 3.12.3',
    compileTimeMs: 18,
    trivia: 'Python makes printing Hello World a single line without any boilerplate or main function wrappers.'
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    extension: '.js',
    category: 'interpreted',
    year: 1995,
    creator: 'Brendan Eich',
    code: `console.log("Hello, World!");`,
    expectedOutput: `Hello, World!`,
    compilerName: 'Node.js v22.4 / V8',
    compileTimeMs: 12,
    trivia: 'Created in just 10 days in May 1995, JavaScript is now the foundation of the modern web.'
  },
  {
    id: 'c',
    name: 'C',
    extension: '.c',
    category: 'compiled',
    year: 1972,
    creator: 'Dennis Ritchie & Brian Kernighan',
    code: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
    expectedOutput: `Hello, World!`,
    compilerName: 'GCC 14.2 (x86_64-linux-gnu)',
    compileTimeMs: 34,
    trivia: 'The original 1978 "The C Programming Language" book by Kernighan & Ritchie popularized "hello, world" globally.'
  },
  {
    id: 'cpp',
    name: 'C++',
    extension: '.cpp',
    category: 'compiled',
    year: 1985,
    creator: 'Bjarne Stroustrup',
    code: `#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}`,
    expectedOutput: `Hello, World!`,
    compilerName: 'Clang++ 18.1 (-std=c++23)',
    compileTimeMs: 42,
    trivia: 'Streams (std::cout) were introduced to replace C standard I/O format strings with type-safe operations.'
  },
  {
    id: 'rust',
    name: 'Rust',
    extension: '.rs',
    category: 'systems',
    year: 2015,
    creator: 'Graydon Hoare / Mozilla',
    code: `fn main() {
    println!("Hello, World!");
}`,
    expectedOutput: `Hello, World!`,
    compilerName: 'rustc 1.81.0 (release)',
    compileTimeMs: 65,
    trivia: 'The exclamation mark in `println!` signifies that it is a macro expanded at compile-time.'
  },
  {
    id: 'go',
    name: 'Go',
    extension: '.go',
    category: 'compiled',
    year: 2009,
    creator: 'Robert Griesemer, Rob Pike, Ken Thompson',
    code: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
    expectedOutput: `Hello, World!`,
    compilerName: 'go version go1.23.1 linux/amd64',
    compileTimeMs: 28,
    trivia: 'Co-created by Unix & B pioneers Ken Thompson and Rob Pike at Google.'
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    extension: '.ts',
    category: 'interpreted',
    year: 2012,
    creator: 'Anders Hejlsberg / Microsoft',
    code: `const message: string = "Hello, World!";
console.log(message);`,
    expectedOutput: `Hello, World!`,
    compilerName: 'tsc 5.6.2 & esbuild',
    compileTimeMs: 15,
    trivia: 'Static types compile away into pristine JavaScript for native execution.'
  },
  {
    id: 'java',
    name: 'Java',
    extension: '.java',
    category: 'compiled',
    year: 1995,
    creator: 'James Gosling / Sun Microsystems',
    code: `public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
    expectedOutput: `Hello, World!`,
    compilerName: 'OpenJDK 21 (HotSpot 64-Bit)',
    compileTimeMs: 58,
    trivia: 'Requires declaring a class even for the simplest output, exemplifying Java pure object-oriented philosophy.'
  },
  {
    id: 'ruby',
    name: 'Ruby',
    extension: '.rb',
    category: 'interpreted',
    year: 1995,
    creator: 'Yukihiro "Matz" Matsumoto',
    code: `puts "Hello, World!"`,
    expectedOutput: `Hello, World!`,
    compilerName: 'Ruby 3.3.4 (YJIT)',
    compileTimeMs: 14,
    trivia: '`puts` is short for "put string" and automatically appends a newline.'
  },
  {
    id: 'swift',
    name: 'Swift',
    extension: '.swift',
    category: 'compiled',
    year: 2014,
    creator: 'Chris Lattner / Apple',
    code: `print("Hello, World!")`,
    expectedOutput: `Hello, World!`,
    compilerName: 'Apple Swift version 6.0',
    compileTimeMs: 38,
    trivia: 'Top-level code is allowed for executable files in Swift, so no class or main func is required.'
  },
  {
    id: 'php',
    name: 'PHP',
    extension: '.php',
    category: 'scripting',
    year: 1995,
    creator: 'Rasmus Lerdorf',
    code: `<?php
echo "Hello, World!\\n";
?>`,
    expectedOutput: `Hello, World!`,
    compilerName: 'PHP 8.3.11 (cli)',
    compileTimeMs: 9,
    trivia: 'Originally stood for "Personal Home Page Tools" before evolving to PHP: Hypertext Preprocessor.'
  },
  {
    id: 'bash',
    name: 'Bash Shell',
    extension: '.sh',
    category: 'scripting',
    year: 1989,
    creator: 'Brian Fox',
    code: `#!/usr/bin/env bash
echo "Hello, World!"`,
    expectedOutput: `Hello, World!`,
    compilerName: 'GNU bash, version 5.2.26',
    compileTimeMs: 5,
    trivia: 'The default shell on millions of Unix and Linux installations worldwide.'
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    extension: '.kt',
    category: 'compiled',
    year: 2011,
    creator: 'JetBrains',
    code: `fun main() {
    println("Hello, World!")
}`,
    expectedOutput: `Hello, World!`,
    compilerName: 'Kotlin 2.0.20-jvm',
    compileTimeMs: 44,
    trivia: 'Concise syntax designed to interoperate seamlessly with the Java Virtual Machine.'
  },
  {
    id: 'html',
    name: 'HTML5',
    extension: '.html',
    category: 'markup',
    year: 1993,
    creator: 'Tim Berners-Lee',
    code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Hello, World!</title>
  </head>
  <body>
    <h1>Hello, World!</h1>
  </body>
</html>`,
    expectedOutput: `<h1>Hello, World!</h1>`,
    compilerName: 'DOM Parser / WebKit Layout Engine',
    compileTimeMs: 4,
    trivia: 'The universal document skeleton structuring every page across the global World Wide Web.'
  }
];

export const WORLD_LANGUAGES: WorldLanguage[] = [
  {
    id: 'en',
    language: 'English',
    nativeName: 'English',
    greeting: 'Hello, World!',
    region: 'Americas',
    speechCode: 'en-US',
    speakersCount: '1.5B',
    culturalNote: 'The canonical programming phrase established by Brian Kernighan in 1974.'
  },
  {
    id: 'es',
    language: 'Spanish',
    nativeName: 'Español',
    greeting: '¡Hola, Mundo!',
    region: 'Europe',
    speechCode: 'es-ES',
    speakersCount: '590M',
    culturalNote: 'Uses the characteristic inverted exclamation mark (¡) typical in Spanish typography.'
  },
  {
    id: 'fr',
    language: 'French',
    nativeName: 'Français',
    greeting: 'Bonjour le monde !',
    region: 'Europe',
    speechCode: 'fr-FR',
    speakersCount: '310M',
    culturalNote: 'French typography places a non-breaking space before exclamation points.'
  },
  {
    id: 'de',
    language: 'German',
    nativeName: 'Deutsch',
    greeting: 'Hallo Welt!',
    region: 'Europe',
    speechCode: 'de-DE',
    speakersCount: '135M',
    culturalNote: 'All German nouns are capitalized, including "Welt" (World).'
  },
  {
    id: 'it',
    language: 'Italian',
    nativeName: 'Italiano',
    greeting: 'Ciao, mondo!',
    region: 'Europe',
    speechCode: 'it-IT',
    speakersCount: '85M',
    culturalNote: '"Ciao" derives from the Venetian phrase "s-ciào vostro" meaning "at your service".'
  },
  {
    id: 'pt',
    language: 'Portuguese',
    nativeName: 'Português',
    greeting: 'Olá, Mundo!',
    region: 'Americas',
    speechCode: 'pt-BR',
    speakersCount: '260M',
    culturalNote: 'Official language of nine countries spanning four continents.'
  },
  {
    id: 'ja',
    language: 'Japanese',
    nativeName: '日本語',
    greeting: 'こんにちは、世界！',
    transliteration: 'Konnichiwa, sekai!',
    region: 'Asia-Pacific',
    speechCode: 'ja-JP',
    speakersCount: '125M',
    culturalNote: 'Uses full-width Japanese punctuation marks (comma "、" and exclamation "！").'
  },
  {
    id: 'zh',
    language: 'Chinese (Mandarin)',
    nativeName: '中文',
    greeting: '你好，世界！',
    transliteration: 'Nǐ hǎo, shìjiè!',
    region: 'Asia-Pacific',
    speechCode: 'zh-CN',
    speakersCount: '1.1B',
    culturalNote: 'Combines 你好 (literally "you are good") and 世界 (the human world/cosmos).'
  },
  {
    id: 'ko',
    language: 'Korean',
    nativeName: '한국어',
    greeting: '안녕하세요, 세상!',
    transliteration: 'Annyeonghaseyo, sesang!',
    region: 'Asia-Pacific',
    speechCode: 'ko-KR',
    speakersCount: '80M',
    culturalNote: 'Written in Hangul, the scientific phonetic alphabet commissioned by King Sejong in 1443.'
  },
  {
    id: 'hi',
    language: 'Hindi',
    nativeName: 'हिन्दी',
    greeting: 'नमस्ते दुनिया!',
    transliteration: 'Namaste duniya!',
    region: 'Asia-Pacific',
    speechCode: 'hi-IN',
    speakersCount: '600M',
    culturalNote: 'Rendered in the Devanagari script, which hangs downward from a continuous horizontal shirorekha line.'
  },
  {
    id: 'ar',
    language: 'Arabic',
    nativeName: 'العربية',
    greeting: 'مرحباً بالعالم!',
    transliteration: 'Marhaban bil-alam!',
    region: 'Middle East & Africa',
    speechCode: 'ar-SA',
    speakersCount: '400M',
    culturalNote: 'Right-to-left cursive script with rich calligraphy traditions dating back over a millennium.'
  },
  {
    id: 'ru',
    language: 'Russian',
    nativeName: 'Русский',
    greeting: 'Привет, мир!',
    transliteration: 'Privet, mir!',
    region: 'Europe',
    speechCode: 'ru-RU',
    speakersCount: '255M',
    culturalNote: '"Мир" famously possesses dual meanings in Russian: both "world/universe" and "peace".'
  },
  {
    id: 'bn',
    language: 'Bengali',
    nativeName: 'বাংলা',
    greeting: 'হ্যালো বিশ্ব!',
    transliteration: 'Hyālō biśba!',
    region: 'Asia-Pacific',
    speechCode: 'bn-IN',
    speakersCount: '275M',
    culturalNote: 'One of the most spoken languages globally with a celebrated literary tradition led by Rabindranath Tagore.'
  },
  {
    id: 'tr',
    language: 'Turkish',
    nativeName: 'Türkçe',
    greeting: 'Merhaba Dünya!',
    region: 'Middle East & Africa',
    speechCode: 'tr-TR',
    speakersCount: '88M',
    culturalNote: 'An agglutinative language featuring vowel harmony and transparent phonetic spelling.'
  },
  {
    id: 'nl',
    language: 'Dutch',
    nativeName: 'Nederlands',
    greeting: 'Hallo Wereld!',
    region: 'Europe',
    speechCode: 'nl-NL',
    speakersCount: '25M',
    culturalNote: 'Closely related to both English and German within the West Germanic language tree.'
  },
  {
    id: 'sv',
    language: 'Swedish',
    nativeName: 'Svenska',
    greeting: 'Hej Världen!',
    region: 'Europe',
    speechCode: 'sv-SE',
    speakersCount: '10M',
    culturalNote: '"Världen" carries the definite suffix "-en" representing "the world".'
  },
  {
    id: 'el',
    language: 'Greek',
    nativeName: 'Ελληνικά',
    greeting: 'Γεια σου κόσμε!',
    transliteration: 'Geia sou kosme!',
    region: 'Europe',
    speechCode: 'el-GR',
    speakersCount: '13M',
    culturalNote: '"Κόσμος" (kosmos) originally meant order, beauty, and ornament in ancient philosophy.'
  },
  {
    id: 'he',
    language: 'Hebrew',
    nativeName: 'עברית',
    greeting: 'שלום עולם!',
    transliteration: 'Shalom Olam!',
    region: 'Middle East & Africa',
    speechCode: 'he-IL',
    speakersCount: '9M',
    culturalNote: '"Shalom" conveys wholeness, harmony, and peace as well as a greeting.'
  },
  {
    id: 'vi',
    language: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    greeting: 'Xin chào thế giới!',
    region: 'Asia-Pacific',
    speechCode: 'vi-VN',
    speakersCount: '85M',
    culturalNote: 'Tonal language written in the Latin alphabet modified with diacritical tone marks.'
  },
  {
    id: 'pl',
    language: 'Polish',
    nativeName: 'Polski',
    greeting: 'Witaj świecie!',
    region: 'Europe',
    speechCode: 'pl-PL',
    speakersCount: '45M',
    culturalNote: '"Świecie" is the vocative case of "świat", used when directly addressing the world.'
  },
  {
    id: 'id',
    language: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    greeting: 'Halo Dunia!',
    region: 'Asia-Pacific',
    speechCode: 'id-ID',
    speakersCount: '200M',
    culturalNote: 'A standardized form of Malay serving as the unifying lingua franca across over 17,000 islands.'
  },
  {
    id: 'sw',
    language: 'Swahili',
    nativeName: 'Kiswahili',
    greeting: 'Hujambo, Ulimwengu!',
    region: 'Middle East & Africa',
    speechCode: 'sw-KE',
    speakersCount: '150M',
    culturalNote: 'Official language of the East African Community and African Union.'
  },
  {
    id: 'la',
    language: 'Latin',
    nativeName: 'Latina',
    greeting: 'Salve, Munde!',
    region: 'Constructed & Classical',
    speechCode: 'la',
    speakersCount: 'Classical',
    culturalNote: 'The lingua franca of European scholarship and scientific classification for two millennia.'
  },
  {
    id: 'eo',
    language: 'Esperanto',
    nativeName: 'Esperanto',
    greeting: 'Saluton, Mondo!',
    region: 'Constructed & Classical',
    speechCode: 'eo',
    speakersCount: '2M',
    culturalNote: 'Created in 1887 by L. L. Zamenhof as an easy-to-learn international auxiliary language.'
  }
];

export const TIMELINE_MILESTONES: TimelineMilestone[] = [
  {
    year: '1972',
    title: 'The Bell Labs Precursor in B',
    author: 'Brian Kernighan',
    context: 'First documented appearance in an internal Bell Labs manual "A Tutorial Introduction to the Language B". Kernighan used it to demonstrate string printing.',
    snippet: `main() {
    extrn a, b, c;
    putchar(a); putchar(b); putchar(c); putchar('!*n');
}
a 'hell';
b 'o, w';
c 'orld';`
  },
  {
    year: '1974',
    title: 'Programming in C: A Tutorial',
    author: 'Brian Kernighan',
    context: 'The earliest published C language tutorial at Bell Laboratories included the immortal phrase formatted with the printf function.',
    snippet: `main() {
    printf("hello, world\\n");
}`
  },
  {
    year: '1978',
    title: 'The C Programming Language (K&R)',
    author: 'Brian Kernighan & Dennis Ritchie',
    context: 'The landmark textbook cemented "hello, world" as the universal initiation ritual for every aspiring software developer worldwide.',
    snippet: `#include <stdio.h>

main()
{
    printf("hello, world\\n");
}`
  },
  {
    year: '1985–Present',
    title: 'The Global Programmer Tradition',
    author: 'Global Engineering Community',
    context: 'From microcontrollers and browser consoles to quantum computers, verifying basic execution with "Hello, World!" remains the ultimate proof of life for any computing platform.',
    snippet: `// Verified: Hardware, Compiler, Standard Library, Output Pipeline`
  }
];
