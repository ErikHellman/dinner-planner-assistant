Planning dinners involve the following steps that we can automate:

- Decide which recipes to cook
- Decide which grocery products to buy

Deciding which recipes to cook requires the following input:

- A set of recipes in a structured and searchable format
- Food preferences of the user
- Constraints for what kind of recipes it should use (time, calories, main ingredients, vegetarian/vegan, allergies, etc.)

Deciding which grocery products to buy requires the following:

- Collection of ingredients from the chosen recipes
- A method for aggregating the ingredients
- Access to an online grocery store, including login credentials for persisting an online shopping cart

A system that consistently can both create a weekly dinner plan and populate an online shopping cart, needs tools for performing the tasks above. These tools should be deterministic to reduce the risk for hallucination by LLMs (and cut cost for running the system). The tools would be used by an LLM to run the overall system.

This is the definition of these tools required:  
Recipe database  
This is a collection of structured text documents for each recipe and a set of tools that can parse these for specific queries. The documents are normalized to one serving, use common cooking measuring (tablespoon, deciliters, grams, etc.), and contain five parts; approximate cooking time, high level description, categories (e.g., vegetarian, fish, italian, soup, etc.), detailed ingredient list for one serving, step-by-step cooking instructions.

Food preference of the user:  
This is simply a set of text documents that becomes part of the prompt when planning the dinner plan each week. Additionally, these documents also specify the number of servings per meal. In the world of LLM, it can be considered as the memory that the agent has in its context. These documents can and will be updated every week.

Tool for aggregating all the ingredients from the selected meals:  
These tools take a set of ingredients in a normalized format (e.g., number of carrots, centiliters of soy sauce, grams of flour, etc.). It will group the ingredients using a hash function where the key is the ingredient and the value is the amount. Amount has two properties, the value and the unit (e.g., 2:grams, 4:pieces, 0.5:liters). Once all the ingredients from the selected meals are aggregated, the system knows all the grocery products to buy and how much of each. The results from this are stored in a temporary file as a JSON object.

Online grocery store tool:  
This tool can login to a grocery store using the user’s credentials, and populate a shopping cart in their online shopping. Additionally, it can search for grocery products using the service built-in search API. It formats the output for each operation (list cart, add to cart, update cart, search, etc.) in a structured format appropriate for LLM consumption. Since no online grocery store has this kind of tool available, it needs to be implemented by reverse-engineering its existing web app and backend integration.

Technical specification:  
The system will be based on the Pi agent harness (see [https://pi.dev/](https://pi.dev/)). The tools are simple CLI scripts in TypeScript that are contained in an agent skill for each task described above. Users interact with the system using a web application, implemented as a fullstack app (TypeScript/NodeJS, using SvelteKit and Fastify). The fullstack app runs the Pi agent to perform all the actions, and presents the results back to the user once a plan is done. The app is single+user, so there is no need to support additional authentication or multiple sessions.

The output from running a dinner planning session are the following:

- Copy of the shopping list created in the online grocery store
- The recipes for this week

The app must be responsive and support both desktop and mobile.
