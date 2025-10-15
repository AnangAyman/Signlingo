def get_initials(full_name):
    name_parts = full_name.split()
    first_name = name_parts[0]
    
    # If there's no last name, use an empty string for the initial
    last_initial = name_parts[1][0] if len(name_parts) > 1 else ''
    
    initials = (first_name[0] + last_initial).upper() 
    return first_name, initials

from flask import session, jsonify
import random,json

def get_random_question(questions):
    if 'questions_asked' not in session or len(session['questions_asked']) >= 10:
        session['questions_asked'] = []  # Track asked questions

    id = random.randint(0, 25)
    while id in session['questions_asked']:
        id = random.randint(0, 25)

    questions_asked = session['questions_asked']
    questions_asked.append(id)
    session['questions_asked'] = questions_asked 

    return questions[id]