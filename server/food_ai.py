"""Food photo and meal-text analysis for the rep server's /rep-api/food-* routes.

These routes exist so the app can reach the food AI through the Metro proxy
(for example over an Expo tunnel, where port 9001 is not reachable). They call
the same trained models as the Footprint AI server (footprint_ai/):

* photo: barcode -> Open Food Facts product; several foods -> one item each;
  otherwise food/non-food gate -> Google AIY food classifier + trained dish head
  -> USDA SR28 nutrition for a typical serving
* text:  USDA SR28 + curated aliases/recipes with an amount parser

The old colour/edge heuristic that lived here has been removed: it guessed a
dish from the photo's colours, which is not a real recognition model.
"""

from __future__ import annotations

from footprint_ai.food_vision import describe_food as _describe_food
from footprint_ai.scan import analyze_food_photo


def analyze_food_image(encoded_image: str, meal_hint: str = '', hint: str = '') -> dict:
    if not encoded_image:
        raise ValueError('No image was sent.')
    try:
        return analyze_food_photo(encoded_image, hint)
    except ValueError:
        raise
    except Exception as error:  # bad/undecodable image
        raise ValueError(f'Could not read the image ({error}).') from error


def describe_food(description: str) -> dict:
    if not (description or '').strip():
        raise ValueError('Describe what you ate.')
    return _describe_food(description)
