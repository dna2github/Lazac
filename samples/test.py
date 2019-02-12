from os import (uname, umask)
import os.path
import subprocess, math
from subprocess import (
   Popen,
   MAXFD,
)

class A1(object):
   pass

class A2():
   pass

class A3:
   pass

table = [A1, A2]

class A4(table[0]):
   pass

class A5:
# this is a test
   test = 1
# this is another test
   """
   doc is a test
   """
   def test():
      print(1)

class A6(
   object # this is a comment
): pass

"""
anno doc
"""
def anno(*xargs):
    def decorate(func):
        def call(*args, **kwargs):
           result = func(*args, **kwargs)
           return result
        return call
    return decorate

def anno2(bind):
    def decorate(func):
        def call(*args, **kwargs):
           result = func(*args, **kwargs)
# break indent but in the same function scope
           return result
        return call
    return decorate

def anx():
    def decorate(func):
        def call(*args, **kwargs):
           result = func(*args, **kwargs)
           return result
        return call
    return decorate

@anx()
class X(): pass

@anno(
   1, 'test', None
)
@anno2
def test():
   @anx()
   def t2():
      """
      this is t2 document
      """
      x = lambda p: test(); x(1)
      # test for indent in next line
      x = lambda p: test()
      x = (lambda p: { 'a': p }, lambda p: { 'b': p }, lambda p: lambda q: {'factory': p })
      x = {'test': lambda: 1}
      print 1
   if a:
      if a:
         b = 1
   else:
      c = 2
