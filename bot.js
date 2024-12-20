const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// Input and output folder paths
const inputFolder = path.join(__dirname, 'inputfolder');
const outputFolder = path.join(__dirname, 'outputfolder');
const API_URL = "https://humbot.ai/api/humbot/v1";
const API_KEY = process.env.API_KEY;

let updatedTexts = [];

async function getAnswerFromServer(originalText) {
    const detectedLanguage = await detectLanguage(originalText);
        // console.log(`detectedLanguage: ${detectedLanguage}`);
        
    const taskId = await sendToApi(originalText, detectedLanguage); // Send text to API
    // const taskId = "api_f07c7031-4559-42bf-b86b-36e7c69c7ce5";
    console.log(`taskId: ${taskId}`);
    if (taskId) {
        const updatedContent = await getToResponse(taskId); // Retrieve the processed text
        console.log(`updatedContent:\n ${updatedContent}`);
        let currentIndex = 0; // Track the current index

        if (updatedContent) {
            // Initialize updatedTexts with default values of ""
            updatedTexts = updatedTexts || []; 

            const eraseAfter100 = updatedContent.indexOf("100.");
            if (eraseAfter100 !== -1) {
                updatedContent = updatedContent.substring(0, eraseAfter100); // Keep content before "100."
            }

            // Split the updatedContent by numbered prefixes (e.g., "3. ")
            const parts = updatedContent.split(/\d+\.\s/).filter(part => part.trim() !== '');

            // Extract the starting number for each part and save in the correct index
            updatedContent
                .split(/\d+\.\s/)
                .forEach((part, i) => {
                    if (i % 2 === 1) { // Odd indexes contain the numeric prefix
                        currentIndex = parseInt(part, 10) - 1; // Convert to zero-based index
                    } else if (part.trim() !== '') { // Even indexes contain the actual content
                        updatedTexts[currentIndex] = part.trim(); // Save content in the correct index
                        console.log(`1.updatedTexts[${currentIndex}]: ${updatedTexts[currentIndex]}`);
                    }
            });
            return updatedTexts;
        } else {
            await getAnswerFromServer(originalText);
        }
    } else {
        console.error("Failed to send text to the API.");
    }
}

// Detect language from text
async function detectLanguage(originalText) {
    const { franc } = await import("franc"); // Use named import for franc
    const langs = (await import("langs")).default;

    const langCode = franc(originalText); // Detect the language code
    if (langCode === "und") {
        return "Unknown"; // If undetected
    }

    const languageObj = langs.where("3", langCode); // Find language name
    return languageObj ? languageObj.name : "Unknown";
}

// Send content to the API
async function sendToApi(text, detectedLanguage) {
    const modelType = (detectedLanguage === "English") ? "Advanced" : "Enhanced";
    console.log(modelType);
    try {
        const response = await axios.post(`${API_URL}/create`, {
            input: text,
            model_type: modelType
        }, {
            headers: {
                'api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        return response.data?.data?.task_id || null;
    } catch (error) {
        console.error("Error sending to API:", error.message);
        return null;
    }
}

// Retrieve response from API
async function getToResponse(taskId) {
    try {
        while (true) {
            const response = await axios.get(`${API_URL}/retrieve`, {
                headers: {
                    'api-key': API_KEY,
                    'Content-Type': 'application/json'
                },
                params: { task_id: taskId }
            });

            const statusData = response.data?.data;
            // console.log(`statusData: ${statusData?.subtask_status}`);
            if (statusData?.subtask_status === "completed") {
                console.log("Task completed successfully!");
                // console.log(`statusData.output: ${statusData.output}`);
                return statusData.output;
            } else if (statusData?.subtask_status === "running") {
                console.log("Task is still running... Waiting for completion.");
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.error("Unexpected task status:", statusData?.subtask_status);
                return null;
            }
        }
    } catch (error) {
        console.error("Error retrieving response from API:", error.message);
        return null;
    }
}

async function processHtmlFile(filePath) {
    const htmlContent = fs.readFileSync(filePath, 'utf-8');

    // Load HTML content into Cheerio
    const $ = cheerio.load(htmlContent);

    // Variables to collect and process
    const tagsToProcess = [];
    const tagsAfterColon = [];
    let originalText = "";
    let originalTextIndex = 0;

    const result = []; // Array to hold the resulting arrays
    let currentBatch = []; // Current batch of strings
    let currentWordCount = 0; // Word count for the current batch

    result_string = [];

    let indexOfResult = 0;
    let indexOfTag = 0;
    updatedTexts = [];
    

    $('p, li').each(function () {
        // Use Cheerio's .contents() to get all child nodes
        let rawContents = $(this).contents();
    
        // Filter to retrieve only text nodes (not elements)
        let elementText = '';
        rawContents.each(function() {
            if (this.type === 'text') {
                elementText += $(this).text().trim() + ' ';
            }
        });
    
        let contentAfterColon = elementText;
    
        if ($(this).is('li')) {
            // For 'li' tags, extract the part after the colon
            contentAfterColon = elementText.includes(':')
                ? elementText.split(':').slice(1).join(':').trim()
                : elementText; // If no colon, use the whole text
        }
    
        const words = contentAfterColon.split(/\s+/);
        // Check if all words are fully uppercase
        const isAllUpperCase = words.every(word => word === word.toUpperCase());
        // Check if all first letters of words are uppercase (Title Case)
        const isAllFirstLetterUpperCase = words.every(word => /^[A-Z]/.test(word));
        // Exclude if all letters are uppercase or all first letters are uppercase
        const isTitleCase = isAllUpperCase || isAllFirstLetterUpperCase;
    
        // Push into tagsToProcess only if it meets the conditions
        if (!isTitleCase && contentAfterColon.split(/\s+/).length > 7) {
            tagsToProcess.push({ element: $(this), text: elementText }); // Store the element and text
            tagsAfterColon.push({ element: $(this), text: elementText });
            // originalText += ` \n#${originalTextIndex+1}. ${contentAfterColon}`; // Add content (split or not)
            
            // console.log(`isTitleCase: ${isTitleCase}`);
            // console.log(`originTextIndex: ${originalTextIndex}. ${contentAfterColon}`);
            // ++originalTextIndex;
        }
        
        // console.log(`3.originalText: ${originalText}`);
    });

    // tagsToProcess.forEach((tag, index) => {
    for (const tag of tagsAfterColon) {
        // Ensure tag is a string and calculate word count
        // console.log(`${tag.text}\n`);
        const wordCount = tag.text.trim().split(/\s+/).length;
        // console.log(wordCount);
    
        // Variable to track the index of the current result sub-array
        
    
        // If adding this tag exceeds the word limit, push the current batch to result and reset
        if (currentWordCount + wordCount > 60) {
            if (!result_string[indexOfResult]) {
                result_string[indexOfResult] = ""; // Initialize if undefined
            }

            result_string[indexOfResult] += `${indexOfTag + 1}### ${tag.text} `;
            ++indexOfResult;
            currentWordCount = 0;
        } else {
            if (!result_string[indexOfResult]) {
                result_string[indexOfResult] = ""; // Initialize if undefined
            }
        
            currentWordCount += wordCount;
            result_string[indexOfResult] += `${indexOfTag + 1}### ${tag.text} `;
        }
        ++indexOfTag;
    }

    for (const [index, originalText] of result_string.entries()) {
        console.log(`${index}: ${originalText}`);
        // await getAnswerFromServer(originalText);
    }

    // Append the last element to the second-to-last and remove the last element
    if (result_string.length > 1) {
        result_string[result_string.length - 2] += result_string[result_string.length - 1];
        result_string.pop();
    }

    // console.log(result);

    
    // console.log(`original text:\n ${originalText}`);

    // Process the text with the API in batches
    for (const [index, originalText] of result_string.entries()) {
        console.log(`${index}: ${originalText}`);
        // await getAnswerFromServer(originalText);
    }

    // console.log(`updatedTexts: ${updatedTexts}`);
    let resendText = "";
    const addedIndices = new Set(); // Declare the set outside the loop to track indices globally

    // tagsAfterColon.forEach((item, index) => {
    //     const updatedText = updatedTexts[index]?.trim(); // Safely attempt to trim
    //     const textNode = item.element.contents().filter(function () {
    //         return this.type === 'text'; // Select only text nodes
    //     });

    //     // Create a set to keep track of already added indices

    //     if (!updatedText) {
    //         console.log(`empty element index: ${index} and its originalText: ${textNode[0]?.data}`);

    //         // Add index - 1 if it's not already added and valid
    //         if (index > 0 && !addedIndices.has(index - 1)) {
    //             const previousTextNode = tagsAfterColon[index - 1].element.contents().filter(function () {
    //                 return this.type === 'text'; // Select only text nodes
    //             });
    //             const previousText = previousTextNode[0]?.data?.trim() || ''; // Get the previous item's content
    //             resendText += `${index - 1}. ${previousText}\n`;
    //             addedIndices.add(index - 1);
    //         }

    //         // Add the current index if it's not already added
    //         if (!addedIndices.has(index)) {
    //             const currentText = textNode[0]?.data?.trim() || ''; // Get the current item's content
    //             resendText += `${index}. ${currentText}\n`;
    //             addedIndices.add(index);
    //         }
    //     }

    // });

    if (resendText) {
        if (resendText.trim().split(/\s+/).length < 50) {
            resendText += `100. Option garantie: Livraison à domicile ou en points de relais, contre signature pour des colis de moins de 30kg et toujours assurée le jour suivant ouvrable avec un objectif de 500€ de garantie. Les livraisons nationales peuvent se faire à domicile, au travail, dans un bureau de poste local, dans l'une des quelque 2300 agences Bpost, voire même dans un magasin à colis ou un distributeur de colis. `;
        }
        console.log(`resendText: ${resendText}`);

        await getAnswerFromServer(resendText);
    }
    


    tagsToProcess.forEach((item, index) => {
        const updatedText = updatedTexts[index]?.trim();
        if (updatedText) {
            // Find the text node directly within the current element
            console.log(`3.updatedText ${index}:, ${updatedText}`);
            const textNode = item.element.contents().filter(function () {
                return this.type === 'text'; // Select only text nodes
            });

            let prefix = ''; // Default prefix
            // Extract the prefix (text before the colon)
            if (item.element.is('li')) {
                const textContent = textNode[0]?.data || ''; // Access the text content of the text node
                prefix = textContent.includes(':')
                    ? textContent.split(':')[0] + ':' // Get the prefix with the colon
                    : ''; // If no colon, leave prefix empty
            }
    
            // Update only the text node without affecting children
            if (textNode.length > 0) {
                textNode[0].data = `${prefix} ${updatedText}`; // Replace the text content
            } else {
                console.warn(`No direct text node found for index ${index}`);
            }
        } 
    });
    // Write the updated HTML to the output folder
    const outputPath = path.join(outputFolder, path.basename(filePath));
    fs.writeFileSync(outputPath, $.html(), 'utf-8');
    console.log(`Processed and saved: ${outputPath}`);
}



// Main function
async function main() {
    // Ensure input folder exists
    if (!fs.existsSync(inputFolder)) {
        console.error("Input folder does not exist.");
        return;
    }

    // Get the first HTML file in the input folder
    const files = fs.readdirSync(inputFolder).filter(file => path.extname(file) === '.html');
    if (files.length === 0) {
        console.error("No HTML files found in the input folder.");
        return;
    }

    for (const file of files) {
        const inputFile = path.join(inputFolder, file);
        // Scrape content from the HTML file
        const scrapedContent = await processHtmlFile(inputFile);
        // console.log(`scrapedContent: ${scrapedContent}`);
        
    }


}

// Run the script
main();
