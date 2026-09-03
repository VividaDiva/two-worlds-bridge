# Your own drawings as goals

Two images, one per role. The `refs` argument stops being about a crossing each
of them *remembers* and becomes about a crossing each of them can *see* — and
that the other cannot.

    1. put two images here, named role1.* and role2.*   (png, jpg, webp; under ~4MB)
    2. node read-drawing.mjs
    3. read what it says it saw, and correct manifest.json if it is wrong
    4. node run.mjs --scenario refs --drawings --goals loose --speech free \
         --a openai --b claude --machine gemini --builder model --turns 10

Step 3 is not optional. Read against drawings it had never seen, the reader got
12 of 16 choices right — and its mistakes were systematic: it read a roof as a
handrail, then reported no roof. Whatever it writes into `manifest.json` is what
the run is scored against, so a wrong line there is a wrong result, silently.

`needs` is the list scored against what gets built. It defaults to every
property of the drawing, which is the goal "reproduce this". Cutting it to the
two or three that matter to that person makes it comparable with the other four
arguments, which give each role two.

Nothing re-reads the images once `manifest.json` exists.
