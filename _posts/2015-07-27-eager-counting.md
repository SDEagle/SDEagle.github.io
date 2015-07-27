---
layout: post
title:  "Killing N+1 queries with eager counting"
category: tech
---

This blogpost was originally written for and published on the [Universalavenue](https://universalavenue.com/) (the company where I'm right now doing a 6 months internship) [tech blog](http://labs.universalavenue.com/).

---------

A few weeks ago I was on the hunt for some low hanging performance fruits in our Rails app.
Our app has some tables in the admin section which gather all sorts of data about our different models.
Some of these tables had started to become quite slow and the reason for this turned out to be - who would have guessed - N+1 queries.

A typical N+1 query might look something like this:

```ruby
# controller
def index
  @places = Place.all
end
```

```erb
<%# view %>
<% @places.each do |place| %>
  City name: <%= place.city.name %>
<% end %>
```

This code has a subtle Problem:
We are iterating over the places and for each place ActiveRecord will need to go and fetch the city and its name.
The database might be super fast in performing complex queries, but connecting over and over to it to just retrieve a single record is not.
Luckily this is not a big deal, we can fix the problem by changing the controller to this:

```ruby
def index
  @places = Place.all.includes(:city)
end
```

ActiveRecord will now prefetch all cities, no more additional queries for each place.
The excellent [rails guides](http://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations) have some more details on this problem.
But in our case things are a little different.

In our admin tables we are aggregating quite some information in the form of counts:
How many times has a user performed some action?
By how many users was that place visited?
How many times was this item sold?
In code:

```ruby
def index
  @places = Place.all
end
```

```erb
<% @places.each do |place| %>
  Visit count: <%= place.visits.count %>
<% end %>
```

Here we also have a N+1 query (ActiveRecord will fire of a `COUNT` query for each place), though it's not really a typical one.
In the cities example we were using a `belongs_to` relation (`Place belongs_to :city`).
Now we have a `has_many` association (`Place has_many :visits`) and we are not retrieving actual values from the visits but only the count.

Now Rails would still allow us to do the following in the controller:

```ruby
def index
  @places = Place.all.includes(:visits)
end
```

Sadly, this would not immediately change anything; ActiveRecord would still hit the database for each place.

There are a few possible solutions to this.

### `.size` instead of `.count`

```erb
<% @places.each do |place| %>
  Visit count: <%= place.visits.size %>
<% end %>
```

While `.count` always triggers a database query, `.size` does notice that the association is actually already populated and just calls `.size` on the array.
(Nice benefit: even if we would not perform the eager loading size would gracefully fallback to count instead of loading all the models and the calling size on the array - might come in handy when this is all actually happens in a partial or so)

Problem solved right? Well...
This solution has some drawbacks.

First: we possibly would retrieve a crazy amount of unnecessary information.
We just want to a count of the visits, but here we're building an ActiveRecord object for each visit to populate it with all the data from the database - this could become a performance problem on its own, most likely not so much in terms of response time but with regards to memory usage.

The second problem: Things might be not as simple as in this example, they actually might look more like this:

```erb
<% @places.each do |place| %>
  Visit count: <%= place.visits.where(spam: false).size %>
<% end %>
```

Now in the real world this `where` condition would hopefully be in a scope or something but for the sake of brevity...
This will render our eager loading pointless and again perform count queries for each place.

There is actually a [workaround](http://www.justinweiss.com/blog/2015/06/23/how-to-preload-rails-scopes) for this.
You can wrap the scope in a association and eager load the new association.
Though that feels a little like a hack to me and also if you have got a lot of these that might get out of hand pretty fast (contrary to scopes you can't combine/chain associations).

### calculated_attributes

Honourable mentions: [nested selects with calculated attributes](http://blog.aha.io/index.php/using-nested-selects-for-performance-in-rails/).
Came around to late; when I read this post I had already built our solution.
Though I don't know if I'd chosen to use it.
The problem is that it makes you hardcode your queries in SQL - no way to use ActiveRecord.
And if you'd have some scopes like in the latter example for the first approach you would need to duplicate that scope logic in SQL.

### Introducing: eager_counting

The solution I ended up with was to do a little less inline magic and a little more of an explicit query to retrieve all that data.

```ruby
# model
class Visit
  belongs_to :place

  def count_by_place
    Hash.new(0).merge group(:place_id).count
  end
end
```

```ruby
def index
  @places = Place.all
  @visit_counts = Visit.count_by_place
end
```

```erb
<% @places.each do |place| %>
  Visit count: <%= @visit_counts[place.id] %>
<% end %>
```

(For those of you worrying that we share more than one instance variable: in the actual code this is all hidden in some nice presenter setup)
Now this is way more explicit.
It uses ActiveRecords group method to do a SQL `GROUP BY` and `COUNT` the number of rows in each group.
ActiveRecord will turn the result into a hash with `place_id`s as keys and the `COUNT` results as the values.
We merge this then into a hash with default value `0` because there might be places without visits and the correct count for these is of course `0` and not `nil`.

This approach has many benefits.
For example if we need our non spam scope:

```ruby
def index
  @places = Place.all
  @visit_counts = Visit.where(spam: false).count_by_place
end
```

And with just another where condition we can also apply scopes on the places:

```ruby
class Visit
  belongs_to :place

  def count_by_place(places = Place.all)
    Hash.new(0).merge where(place: places).group(:place_id).count
  end
end
```

```ruby
def index
  @places = Place.where(type: 'pub')
  @visit_counts = Visit.where(spam: false).count_by_place(@places)
end
```

ActiveRecord is intelligent enough to turn the places query into SQL inside the where condition instead of executing it.
So `count_by_place` performs just a single SQL query.
Though in this case we still end up with two queries since we're iterating over the places.

Really handy.
As I continued working on finding and fixing more N+1 queries I built a couple more of these `count_by_something` methods.
Turned out, it's even easy to do this through joined associations:

```ruby
class Action
  belongs_to :visit

  def count_by_place(places = Place.all)
    Hash.new(0).merge joins(:visit).merge(Visit.where(place: places)).group('visits.place_id').count
  end
end
```

It became clear pretty fast that this is a fairly generic pattern which works on almost any `belongs_to` association.
Fast forwarding through some refactoring and ActiveRecord reflection wizardry which would blow the scope of this post (we might feature that in another future post) I am proud to present to you what we extracted out of all this:
The [eager_counting](https://github.com/UniversalAvenue/eager_counting) gem.
It gives you a simple ActiveRecord like interface around complex grouped `COUNT` queries:

```ruby
Visit.where(spam: false).count_by(:place, @places)
Action.count_by(visit: :place) # count by joined associations
Comment.count_by(:commentable, Picture.all) # count by polymorphic associations
# and more magic - see the docs at https://github.com/UniversalAvenue/eager_counting
```

I hope you find it useful.

Until next time!
