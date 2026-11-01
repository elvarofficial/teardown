# Prompts

## 1

Give me a high fidelity roulette wheel physical model. It should be built from real parts (a complete BoM) wherever possible. For the first cut, give me the most realistic physical model possible. Use fundamental laws of motion, realistic ranges for things like friction coeffs, and allow us to perturb the "as designed" wheel with "as built" deltas.

We will then run Monte Carlo simulations using the wheel to determine if certain offsets/ biases/ etc. in the mechanical setup shift the distributions of numbers hit on the wheel.

For the first cut, put as much effort as possible into the ball physics. The table features should be realistic/ representative but do not need as much fidelity if that makes sense. Maybe a good first demo would be to have all offsets/ biases available (i.e. the mechanical tolerance stackup by element). BUT ZERO THEM ALL OUT. Then, offer a simple selection of different balls (marble, wood, ceramic, etc. whatever is used in real world throughout history).

Record this message in our local repo as "prompts.md" which we will add every subsequent prompt to.

## 2

Once complete, this repo should give any other user the Monte Carlo simulation capability. I.e. someone who has already forked the chameleon demo can then merge in our changes/ new modules and run a monte carlo sim on whatever physical model they have generated. So we need to keep it very abstract and expect user inputs.

Is this capability best captured in a new skill defined in our repo? Or should it be approached in some other way?

## 3

Once you are caught up, explore the simulation space as we have designed it. Are you able to find any mechanical tolerances with a particularly high sensitivity to the final distribution? Use this step to determine a reasonable number of iterations per configuration as we simulate. Besides the data on our model universe, it should also provide a guide for other users to tune MC settings in a way that suits their model(s).

## 4

Use the general framework of sensitivity study (small N probe) to full MC sweep (informed by sensitivity study).

## 5

* make sure we include cross-coupling terms
* make sure we use a library of physical coefficients, ideally sourced from real data
* make sure all physics models have real units, preferably using python pint package
* include an initial condition setter for "the toss" with reasonable ranges, and some kind of clever UI for the user to throw the ball (think Tiger Woods Golf putting or similar, at least that is my general expectation - can't think of a better 6-dof analogy right now.)
