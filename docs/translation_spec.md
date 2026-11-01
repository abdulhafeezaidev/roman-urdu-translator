# Roman Urdu Translator — Translation Specification

## 1. Purpose

This document defines exactly how English text must be converted into Roman Urdu.

The translation engine must follow this specification.

---

## 2. Target Language

Target language:

Pakistani Roman Urdu.

Roman Urdu means Urdu expressed using Latin/English characters.

Example:

English:
"Please install the required dependencies before running the application."

Roman Urdu:
"Application run karne se pehle required dependencies install kar lein."

---

## 3. No Urdu Script

The output MUST NOT use Urdu/Arabic script.

Incorrect:

"ایپلیکیشن چلانے سے پہلے ضروری dependencies انسٹال کریں۔"

Correct:

"Application run karne se pehle required dependencies install kar lein."

---

## 4. No Hindi/Hinglish Conversion

Do NOT use Hindi as an intermediate language.

The intended language is Pakistani Roman Urdu.

Do not optimize for Indian Hinglish conventions.

---

## 5. Natural Language Over Literal Translation

The output should communicate the original meaning naturally.

Do not translate word-by-word when doing so produces unnatural Roman Urdu.

English:

"Make sure the server is running before sending the request."

Preferred:

"Request send karne se pehle make sure karein ke server run ho raha hai."

Not:

"Request bhejne se pehle server ke chalne ko ensure karein."

---

## 6. Technical Terms

Technical terminology should generally remain in English when Pakistani developers commonly use the English term.

Examples:

* API
* SDK
* framework
* library
* function
* variable
* class
* object
* method
* request
* response
* endpoint
* server
* client
* browser
* database
* dependency
* package
* repository
* runtime
* compiler
* debugger
* deployment
* backend
* frontend

Do not unnecessarily convert these into awkward Urdu equivalents.

---

## 7. English + Roman Urdu Mixing

Natural Pakistani technical communication commonly mixes English technical vocabulary with Roman Urdu grammar.

This is acceptable and preferred.

Example:

"Is function ko call karne se pehle parameter ki value check karni hogi."

---

## 8. Meaning Preservation

The translation must preserve:

* original meaning
* technical meaning
* conditions
* warnings
* instructions
* relationships between sentences
* numbers
* names
* important terminology

Do not add information that does not exist in the original.

Do not remove important information.

Do not explain the content unless the original text itself explains it.

---

## 9. Tone

Default tone:

* natural
* conversational
* clear
* neutral
* Pakistani
* technically accurate

Avoid:

* overly formal Urdu
* literary Urdu
* poetic Urdu
* Hindi-style vocabulary
* childish language
* unnecessary slang

---

## 10. Examples

### Example 1

English:

"Before using the API, you need to create an API key."

Roman Urdu:

"API use karne se pehle aapko API key create karni hogi."

---

### Example 2

English:

"The browser sends a request to the server."

Roman Urdu:

"Browser server ko aik request send karta hai."

---

### Example 3

English:

"If the request fails, the application will display an error."

Roman Urdu:

"Agar request fail ho jaye to application aik error display karegi."

---

### Example 4

English:

"Install the package using the following command."

Roman Urdu:

"Package ko following command use karke install karein."

---

## 11. Code Preservation

Never translate source code.

Example:

```javascript
const user = await fetch("/api/users");
```

must remain exactly unchanged.

---

## 12. URLs

Never translate URLs.

Example:

https://developer.mozilla.org/

must remain unchanged.

---

## 13. Identifiers

Never translate:

* variable names
* function names
* class names
* package names
* file names
* command names
* API names

Example:

`getUserData()`

must remain:

`getUserData()`

---

## 14. Translation Quality Priority

When making translation decisions, use this priority:

1. Preserve technical meaning
2. Preserve original meaning
3. Produce natural Pakistani Roman Urdu
4. Preserve technical English terminology
5. Maintain readable sentence structure
6. Avoid unnecessary verbosity

---

## 15. Important Rule

The translation engine must NOT behave like a generic Urdu translator.

It should behave like a Pakistani technical documentation translator whose output is written in Roman Urdu.
